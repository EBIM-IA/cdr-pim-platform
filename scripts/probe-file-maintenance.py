#!/usr/bin/env python3
"""Read ECS/CloudWatch evidence of file cleanup for the deployment just promoted.

This probe never runs a task, changes a service, deletes an object, or modifies IAM.
Only allowlisted diagnostics leave memory; AWS responses and raw logs are not printed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable


MAX_TASKS = 10
MAX_ATTEMPTS = 6
RETRY_SECONDS = 10
MAX_RUN_SECONDS = 180
SUMMARY_FIELDS = (
    "pages", "observed", "protected", "deleted", "absent", "changed", "failed", "reclaimedBytes"
)
ERROR_CODES = frozenset(("ACCESS_DENIED", "TIMEOUT", "UNAVAILABLE"))
DEPENDENCIES = frozenset((
    "file-maintenance", "file-maintenance-database", "s3:maintenance-inventory", "s3:maintenance-delete"
))
COMPLETED_MESSAGES = frozenset((
    "File maintenance completed", "File maintenance completed with retryable purge failures"
))
UNAVAILABLE_MESSAGE = "File maintenance unavailable; files retained and retry scheduled"
READ_OPERATIONS = frozenset((
    ("ecs", "describe-services"), ("ecs", "list-tasks"), ("ecs", "describe-tasks"),
    ("ecs", "describe-task-definition"), ("logs", "get-log-events"),
))


class ReadUnavailable(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class AwsReadClient:
    def __init__(self, deadline: float) -> None:
        self.deadline = deadline

    def read(self, service: str, operation: str, *arguments: str) -> dict[str, Any]:
        if (service, operation) not in READ_OPERATIONS:
            raise ReadUnavailable("UNAVAILABLE")
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise ReadUnavailable("TIMEOUT")
        try:
            result = subprocess.run(
                ["aws", service, operation, *arguments, "--output", "json", "--no-cli-pager",
                 "--cli-connect-timeout", "3", "--cli-read-timeout", "8"],
                capture_output=True, text=True, timeout=min(15, remaining), check=False,
                env={**os.environ, "AWS_PAGER": "", "AWS_MAX_ATTEMPTS": "1"},
            )
        except subprocess.TimeoutExpired:
            raise ReadUnavailable("TIMEOUT") from None
        except OSError:
            raise ReadUnavailable("UNAVAILABLE") from None
        if result.returncode != 0:
            # Extract only AWS's fixed error code, never its vendor message or endpoint.
            match = re.search(r"An error occurred \(([A-Za-z0-9]+)\)", result.stderr)
            code = match.group(1) if match else ""
            if code in {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "ForbiddenException"}:
                raise ReadUnavailable("ACCESS_DENIED")
            if code in {"ResourceNotFoundException", "ResourceNotFound"}:
                raise ReadUnavailable("NOT_FOUND")
            if code in {"RequestTimeout", "RequestTimeoutException"} or re.search(
                r"(?:Read|Connect) timeout on endpoint", result.stderr
            ):
                raise ReadUnavailable("TIMEOUT")
            raise ReadUnavailable("UNAVAILABLE")
        try:
            if len(result.stdout) > 8 * 1024 * 1024:
                raise ValueError()
            document = json.loads(result.stdout)
            if not isinstance(document, dict):
                raise ValueError()
            return document
        except (ValueError, TypeError):
            raise ReadUnavailable("UNAVAILABLE") from None


def counter(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 2**53 - 1


def cleanup_record(raw: Any) -> dict[str, Any] | None:
    """Discard all fields except cleanup status, numeric counters and fixed error labels."""
    if not isinstance(raw, str) or not raw.startswith("{") or len(raw) > 1024 * 1024:
        return None
    try:
        record = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(record, dict) or not isinstance(record.get("message"), str):
        return None
    message = record["message"]
    if not message.startswith("File maintenance "):
        return None
    if message == UNAVAILABLE_MESSAGE:
        code, dependency = record.get("code"), record.get("dependency")
        return {
            "status": "failed",
            "code": code if isinstance(code, str) and code in ERROR_CODES else "UNAVAILABLE",
            "dependency": dependency if isinstance(dependency, str) and dependency in DEPENDENCIES else "file-maintenance",
        }
    status = record.get("status")
    if message not in COMPLETED_MESSAGES or not isinstance(status, str) or status not in {"completed", "busy", "disabled"}:
        return None
    if not all(counter(record.get(field)) for field in SUMMARY_FIELDS):
        return None
    clean = {"status": record["status"], **{field: record[field] for field in SUMMARY_FIELDS}}
    codes = record.get("failureCodes")
    clean["failureCodes"] = {
        code: value for code, value in codes.items() if code in ERROR_CODES and counter(value)
    } if isinstance(codes, dict) else {}
    return clean


def outcome(status: str, reason: str, task_count: int = 0, records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    safe = records or []
    return {"status": status, "reason": reason, "tasks": task_count, "records": safe}


def probe(
    client: AwsReadClient,
    environment: str,
    version: str,
    *,
    sleep: Callable[[float], None] = time.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> dict[str, Any]:
    deadline = monotonic() + MAX_RUN_SECONDS
    cluster = f"cdr-pim-{environment}"
    service = f"{cluster}-api"
    try:
        response = client.read("ecs", "describe-services", "--cluster", cluster, "--services", service)
        services = response.get("services", [])
        if len(services) != 1 or not isinstance(services[0], dict):
            return outcome("unavailable", "SERVICE_METADATA_MISSING")
        task_definition = services[0].get("taskDefinition")
        if not isinstance(task_definition, str) or not task_definition:
            return outcome("unavailable", "SERVICE_METADATA_MISSING")
        definition = client.read("ecs", "describe-task-definition", "--task-definition", task_definition).get("taskDefinition", {})
        containers = definition.get("containerDefinitions", [])
        if not containers or not isinstance(containers[0], dict):
            return outcome("unavailable", "API_METADATA_MISSING")
        api = containers[0]
        if [item.get("value") for item in api.get("environment", []) if item.get("name") == "APP_VERSION"] != [version]:
            return outcome("unavailable", "DEPLOYMENT_VERSION_MISMATCH")
        name = api.get("name")
        logging = api.get("logConfiguration", {})
        options = logging.get("options", {})
        group, prefix = options.get("awslogs-group"), options.get("awslogs-stream-prefix")
        if (
            logging.get("logDriver") != "awslogs" or not isinstance(group, str) or not group
            or not isinstance(prefix, str) or not prefix or not isinstance(name, str) or not name
        ):
            return outcome("unavailable", "CLOUDWATCH_CONFIGURATION_MISSING")
        response = client.read("ecs", "list-tasks", "--cluster", cluster, "--service-name", service,
                               "--desired-status", "RUNNING", "--max-results", str(MAX_TASKS), "--no-paginate")
        arns = response.get("taskArns", [])
        if not isinstance(arns, list) or not arns or not all(isinstance(arn, str) for arn in arns):
            return outcome("unavailable", "CURRENT_TASKS_MISSING")
        response = client.read("ecs", "describe-tasks", "--cluster", cluster, "--tasks", *arns[:MAX_TASKS])
        streams = []
        for task in response.get("tasks", []):
            if task.get("lastStatus") != "RUNNING" or task.get("taskDefinitionArn") != task_definition or task.get("group") != f"service:{service}":
                continue
            task_id = task.get("taskArn", "").rsplit("/", 1)[-1]
            if re.fullmatch(r"[a-f0-9]{32}", task_id):
                streams.append(f"{prefix}/{name}/{task_id}")
        streams = list(dict.fromkeys(streams))[:MAX_TASKS]
        if not streams:
            return outcome("unavailable", "CURRENT_TASKS_MISSING")
    except ReadUnavailable as error:
        return outcome("unavailable", f"ECS_{error.code}")
    except (AttributeError, KeyError, TypeError, ValueError):
        return outcome("unavailable", "ECS_RESPONSE_INVALID")

    records: list[dict[str, Any]] = []
    evidence: dict[tuple[str, str, str], dict[str, Any]] = {}
    tokens: dict[str, str] = {}
    read_errors: dict[str, str] = {}
    for attempt in range(MAX_ATTEMPTS):
        for stream in streams:
            if monotonic() >= deadline:
                read_errors[stream] = "TIMEOUT"
                break
            arguments = ["--log-group-name", group, "--log-stream-name", stream,
                         "--start-from-head", "--limit", "1000", "--no-paginate"]
            if stream in tokens:
                arguments += ["--next-token", tokens[stream]]
            try:
                page = client.read("logs", "get-log-events", *arguments)
            except ReadUnavailable as error:
                read_errors[stream] = error.code
                continue
            read_errors.pop(stream, None)
            next_token = page.get("nextForwardToken")
            if isinstance(next_token, str) and next_token:
                tokens[stream] = next_token
            events = page.get("events", [])
            if not isinstance(events, list):
                read_errors[stream] = "UNAVAILABLE"
                continue
            for event in events[:1000]:
                if not isinstance(event, dict):
                    continue
                clean = cleanup_record(event.get("message"))
                if clean is None:
                    continue
                # Bound evidence independently of log volume; retain failures even if a
                # later job completes, without retaining raw records or task identifiers.
                diagnostic = clean.get("code", "purge-failure" if clean.get("failed", 0) else "")
                evidence[(stream, clean["status"], diagnostic)] = clean
        records = list(evidence.values())
        failures = [record for record in records if record["status"] in {"failed", "disabled"} or record.get("failed", 0) > 0]
        if failures:
            return outcome("failed", "CLEANUP_FAILED", len(streams), records)
        if any(record["status"] == "completed" and record["pages"] > 0 for record in records):
            return outcome("verified", "COMPLETED", len(streams), records)
        remaining = deadline - monotonic()
        if attempt + 1 < MAX_ATTEMPTS and remaining > 0:
            sleep(min(RETRY_SECONDS, remaining))
        else:
            break
    read_error = next((code for code in ("ACCESS_DENIED", "TIMEOUT", "NOT_FOUND", "UNAVAILABLE") if code in read_errors.values()), None)
    reason = f"CLOUDWATCH_{read_error}" if read_error else (
        "BUSY_WITHOUT_COMPLETION" if any(record["status"] == "busy" for record in records) else "CLEANUP_LOG_MISSING"
    )
    return outcome("unavailable", reason, len(streams), records)


def publish(result: dict[str, Any], environment: str) -> None:
    # All text is static and all interpolated values were generated or allowlisted above.
    lines = [f"File cleanup probe: {result['status']} ({result['reason']}); current tasks={result['tasks']}"]
    for record in result["records"]:
        if record["status"] == "failed":
            lines.append(f"Cleanup error: {record['code']}; dependency={record['dependency']}")
        else:
            fields = " ".join(f"{field}={record[field]}" for field in SUMMARY_FIELDS)
            codes = " ".join(f"{code}={count}" for code, count in sorted(record["failureCodes"].items()))
            lines.append(f"Cleanup {record['status']}: {fields}" + (f"; {codes}" if codes else ""))
    print("\n".join(lines))
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a") as file:
            file.write(f"status={result['status']}\nreason={result['reason']}\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with Path(summary).open("a") as file:
            file.write(f"\n### File cleanup operational evidence ({environment})\n\n")
            file.write("\n".join(f"- {line}" for line in lines) + "\n")
            if result["status"] == "unavailable":
                file.write("\nExecution could not be verified; no permissions or cleanup success are assumed.\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=("qas", "prd"), required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.version):
        parser.error("--version must be a full lowercase commit SHA")
    result = probe(AwsReadClient(time.monotonic() + MAX_RUN_SECONDS), args.environment, args.version)
    publish(result, args.environment)
    return 0 if result["status"] == "verified" else 1


if __name__ == "__main__":
    sys.exit(main())
