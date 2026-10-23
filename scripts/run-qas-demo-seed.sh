#!/usr/bin/env bash
# Called only by the manual main-branch workflow, with the QAS OIDC role.
set -euo pipefail
umask 077

if [[ "${GITHUB_REF:-}" != 'refs/heads/main' ]]; then
  echo 'QAS demo tasks must originate from main.' >&2
  exit 1
fi
if [[ "${SEED_MODE:-}" != 'dry-run' && "${SEED_MODE:-}" != 'apply' ]]; then
  echo 'SEED_MODE must be dry-run or apply.' >&2
  exit 1
fi
if [[ ! "${SEED_IMAGE:-}" =~ /cdr-pim-api@sha256:[0-9a-f]{64}$ ]]; then
  echo 'The seed image must use an immutable cdr-pim-api digest.' >&2
  exit 1
fi
test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
jq -e 'type == "object" and (.awsvpcConfiguration.subnets | length > 0)' \
  <<< "$MIGRATION_NETWORK_CONFIGURATION" >/dev/null

cluster=cdr-pim-qas
family=cdr-pim-qas-migrate
mkdir -p qas-demo-result
private_directory=$(mktemp -d)
task_arn=''
task_finished=false
cleanup() {
  if [[ -n "$task_arn" && "$task_finished" != true ]]; then
    aws ecs stop-task --cluster "$cluster" --task "$task_arn" \
      --reason 'QAS demo workflow ended before task completion' >/dev/null || true
  fi
  rm -rf "$private_directory"
}
trap cleanup EXIT

aws ecs describe-task-definition --task-definition "$family" \
  --query taskDefinition > "$private_directory/base.json"
jq -e '
  (.family == "cdr-pim-qas-migrate")
  and (.containerDefinitions | length == 1)
  and ([.containerDefinitions[0].environment[]? | select(.name == "APP_ENV") | .value] == ["qas"])
  and (.containerDefinitions[0].logConfiguration.logDriver == "awslogs")
' "$private_directory/base.json" >/dev/null

container_name=$(jq -r '.containerDefinitions[0].name' "$private_directory/base.json")
log_group=$(jq -r '.containerDefinitions[0].logConfiguration.options["awslogs-group"]' "$private_directory/base.json")
log_prefix=$(jq -r '.containerDefinitions[0].logConfiguration.options["awslogs-stream-prefix"]' "$private_directory/base.json")
[[ "$log_group" != 'null' && "$log_prefix" != 'null' ]]

# The migration family already has the correct database secret reference, TLS and
# private network. Only its image and command change; no service is updated.
jq --arg image "$SEED_IMAGE" --arg mode "--$SEED_MODE" '
  .family = "cdr-pim-qas-demo-seed"
  | .containerDefinitions[0].image = $image
  | .containerDefinitions[0].command = ["node", "dist/database/seed-qas-demo.cli.js", $mode]
  | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
        .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)
' "$private_directory/base.json" > "$private_directory/seed.json"
seed_td=$(aws ecs register-task-definition --cli-input-json "file://$private_directory/seed.json" \
  --query 'taskDefinition.taskDefinitionArn' --output text)
aws ecs run-task --cluster "$cluster" --task-definition "$seed_td" \
  --launch-type FARGATE --network-configuration "$MIGRATION_NETWORK_CONFIGURATION" \
  > "$private_directory/start.json"
jq -e '(.failures | length == 0) and (.tasks | length == 1)' "$private_directory/start.json" >/dev/null
task_arn=$(jq -r '.tasks[0].taskArn' "$private_directory/start.json")
echo "QAS demo $SEED_MODE task: $task_arn"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"
task_finished=true
aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query 'tasks[0].{lastStatus:lastStatus,stopCode:stopCode,stoppedReason:stoppedReason,containers:containers[].{name:name,exitCode:exitCode,reason:reason}}' \
  > qas-demo-result/task.json

# Collect only CLI output, not environment or secret references. IDs are retained
# in bounded chunks by the CLI so CloudWatch cannot truncate a large manifest.
log_stream="$log_prefix/$container_name/${task_arn##*/}"
rm -f qas-demo-result/summary.json
for attempt in 1 2 3 4 5; do
  : > qas-demo-result/output.log
  token=''
  for page in {1..100}; do
    token_arguments=()
    if [[ -n "$token" ]]; then token_arguments=(--next-token "$token"); fi
    if ! aws logs get-log-events --log-group-name "$log_group" --log-stream-name "$log_stream" \
      --start-from-head "${token_arguments[@]}" --output json > "$private_directory/messages.json"; then
      break
    fi
    jq -r '.events[].message' "$private_directory/messages.json" >> qas-demo-result/output.log
    next_token=$(jq -r '.nextForwardToken // empty' "$private_directory/messages.json")
    if [[ -z "$next_token" || "$next_token" == "$token" ]]; then break; fi
    token=$next_token
  done
  if python3 - <<'PY'
import json
import os
import pathlib
import sys

directory = pathlib.Path('qas-demo-result')
results = []
identifiers = {}
for line in (directory / 'output.log').read_text().splitlines():
    if line.startswith('QAS_DEMO_RESULT '):
        results.append(json.loads(line.removeprefix('QAS_DEMO_RESULT ')))
    elif line.startswith('QAS_DEMO_INSERTED_IDS '):
        chunk = json.loads(line.removeprefix('QAS_DEMO_INSERTED_IDS '))
        identifiers.setdefault(chunk['table'], []).extend(chunk['ids'])
if len(results) != 1 or results[0]['mode'] != os.environ['SEED_MODE']:
    sys.exit(1)
summary = results[0]
for table, counts in summary['tables'].items():
    values = identifiers.get(table, [])
    if len(values) != counts['inserted'] or len(set(values)) != len(values):
        sys.exit(1)
(directory / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
sys.exit(0)
PY
  then
    break
  fi
  sleep 3
done
exit_code=$(jq -r '.containers[0].exitCode' qas-demo-result/task.json)
if [[ "$exit_code" != 0 ]]; then
  tail -20 qas-demo-result/output.log
  echo "QAS demo task failed with exit code $exit_code." >&2
  exit 1
fi
test -s qas-demo-result/summary.json
jq -e --arg mode "$SEED_MODE" '.mode == $mode' qas-demo-result/summary.json >/dev/null
cat qas-demo-result/summary.json
{
  printf '### QAS demo data: %s\n\n' "$SEED_MODE"
  echo '```json'
  cat qas-demo-result/summary.json
  echo '```'
} >> "$GITHUB_STEP_SUMMARY"
