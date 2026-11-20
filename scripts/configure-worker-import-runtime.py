#!/usr/bin/env python3
"""Prepare a worker task definition for ADR-017 without fetching any secret value.

Usage: configure-worker-import-runtime.py WORKER.json API.json OUTPUT.json
       configure-worker-import-runtime.py --check WORKER.json API.json

Optional --environment, --region and --account-id add the promotion's known context.
Inputs are taskDefinition objects (not the outer describe-task-definition response).
Only the primary worker container's DATABASE_URL secret reference, two non-secret
TLS settings and readiness check may change. Roles, networking, images and sidecars stay intact.
The caller removes ECS read-only registration metadata, if necessary. No AWS calls occur.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any


TLS_ENVIRONMENT = {
    "DATABASE_SSL": "true",
    "DATABASE_SSL_CA_FILE": "/app/certs/rds-global-bundle.pem",
}
HEALTH_SCRIPT = (
    "fetch('http://127.0.0.1:'+(process.env.WORKER_PORT||3002)+'/health/ready')"
    ".then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
)
HEALTH_CHECK = {
    "command": ["CMD", "node", "-e", HEALTH_SCRIPT],
    "interval": 30,
    "timeout": 5,
    "startPeriod": 30,
    "retries": 3,
}
REGION = re.compile(r"^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+$")
ARN = re.compile(r"^arn:(aws(?:-[a-z]+)*):([a-z0-9-]+):([^:]*):([0-9]{12}):(.+)$")
ECR = re.compile(r"^([0-9]{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?/")
ENVIRONMENT_TOKEN = re.compile(r"(?:^|[-_/])(qas|prd)(?=$|[-_/])", re.IGNORECASE)


class ConfigurationError(ValueError):
    """Every message is fixed metadata: never interpolate input values into errors."""


def primary_container(definition: Any, kind: str) -> dict[str, Any]:
    if not isinstance(definition, dict):
        raise ConfigurationError("Each input must be a task definition JSON object")
    containers = definition.get("containerDefinitions")
    if not isinstance(containers, list) or not containers or any(
        not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"]
        for item in containers
    ):
        raise ConfigurationError("Each task must have named containers and a primary container at index zero")
    if len({item["name"] for item in containers}) != len(containers):
        raise ConfigurationError("Duplicate container names are ambiguous")
    family = definition.get("family", "")
    if not isinstance(family, str):
        raise ConfigurationError("Task family must be a string")
    known_family = re.fullmatch(r"cdr-pim-(qas|prd)-(api|worker)", family)
    if known_family and known_family.group(2) != kind:
        raise ConfigurationError("The task family does not match the input application")
    return containers[0]


def entries(container: dict[str, Any], field: str, value_field: str) -> dict[str, dict[str, str]]:
    values = container.get(field, [])
    if not isinstance(values, list) or any(
        not isinstance(item, dict)
        or not isinstance(item.get("name"), str)
        or not item["name"]
        or not isinstance(item.get(value_field), str)
        for item in values
    ):
        raise ConfigurationError("Environment and secret entries require string names and values")
    if len({item["name"] for item in values}) != len(values):
        raise ConfigurationError("Duplicate environment or secret names are ambiguous")
    return {item["name"]: item for item in values}


def checked_entries(container: dict[str, Any]) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    environment = entries(container, "environment", "value")
    secrets = entries(container, "secrets", "valueFrom")
    if "DATABASE_URL" in environment:
        raise ConfigurationError("DATABASE_URL must be a secret reference, never a plaintext environment entry")
    if environment.keys() & secrets.keys():
        raise ConfigurationError("An environment name is also configured as a secret")
    return environment, secrets


def worker_health_check(existing: Any) -> dict[str, Any]:
    """Install a bounded readiness check, preserving a correct, more patient policy."""
    result = copy.deepcopy(HEALTH_CHECK)
    accepted_commands = (
        HEALTH_CHECK["command"],
        ["CMD-SHELL", f'node -e "{HEALTH_SCRIPT}"'],
    )
    if isinstance(existing, dict) and existing.get("command") in accepted_commands:
        # ECS bounds; bool is deliberately not accepted as an integer duration.
        for field, maximum in (("interval", 300), ("timeout", 60), ("startPeriod", 300), ("retries", 10)):
            value = existing.get(field)
            if type(value) is int and result[field] <= value <= maximum:
                result[field] = value
    return result


def parsed_arn(value: str) -> tuple[str, str, str, str, str]:
    match = ARN.fullmatch(value)
    if not match:
        raise ConfigurationError("The database secret reference must be a complete Secrets Manager or SSM ARN")
    return match.groups()


def database_reference(value: str) -> tuple[str, str, str, str, str]:
    partition, service, region, account, resource = parsed_arn(value)
    if not REGION.fullmatch(region):
        raise ConfigurationError("The database secret ARN must contain a valid region")
    if service == "secretsmanager":
        if not resource.startswith("secret:"):
            raise ConfigurationError("The database reference is not a Secrets Manager secret")
        parts = resource[7:].split(":")
        if len(parts) not in (1, 4) or not parts[0] or any(
            not re.fullmatch(r"[A-Za-z0-9/_+=.@-]*", part) for part in parts
        ):
            raise ConfigurationError("The Secrets Manager reference has invalid secret or selector syntax")
        if len(parts) == 4 and parts[2] and parts[3]:
            raise ConfigurationError("A secret reference cannot select both a version stage and a version ID")
    elif service == "ssm":
        if not re.fullmatch(r"parameter/[A-Za-z0-9_.\-/]+", resource):
            raise ConfigurationError("The database reference is not an SSM parameter ARN")
    else:
        raise ConfigurationError("The database reference must use Secrets Manager or SSM")
    return partition, service, region, account, resource


def validate_context(
    worker: dict[str, Any], api: dict[str, Any], worker_env: dict[str, dict[str, str]],
    api_env: dict[str, dict[str, str]], references: list[str], *,
    environment: str | None = None, region: str | None = None, account_id: str | None = None,
) -> None:
    contexts: dict[str, set[str]] = {"environment": set(), "region": set(), "account": set(), "partition": set()}
    if environment is not None:
        if environment not in ("qas", "prd"):
            raise ConfigurationError("The explicit environment must be qas or prd")
        contexts["environment"].add(environment)
    if region is not None:
        if not REGION.fullmatch(region):
            raise ConfigurationError("The explicit region is invalid")
        contexts["region"].add(region)
    if account_id is not None:
        if not re.fullmatch(r"[0-9]{12}", account_id):
            raise ConfigurationError("The explicit AWS account must contain twelve digits")
        contexts["account"].add(account_id)
    for definition, env in ((worker, worker_env), (api, api_env)):
        for value in [definition.get("family", ""), *(str(definition.get(key, "")) for key in ("taskDefinitionArn", "taskRoleArn", "executionRoleArn"))]:
            contexts["environment"].update(match.lower() for match in ENVIRONMENT_TOKEN.findall(value))
            if value.startswith("arn:"):
                partition, _, arn_region, account, _ = parsed_arn(value)
                contexts["partition"].add(partition)
                contexts["account"].add(account)
                if arn_region:
                    contexts["region"].add(arn_region)
        if "APP_ENV" in env:
            app_environment = env["APP_ENV"]["value"]
            if app_environment not in ("qas", "prd"):
                raise ConfigurationError("Hosted worker configuration requires APP_ENV qas or prd")
            contexts["environment"].add(app_environment)
        for key in ("AWS_REGION", "AWS_DEFAULT_REGION"):
            if key in env:
                if not REGION.fullmatch(env[key]["value"]):
                    raise ConfigurationError("A configured AWS region has invalid syntax")
                contexts["region"].add(env[key]["value"])
        container = definition["containerDefinitions"][0]
        image = container.get("image", "")
        if isinstance(image, str):
            ecr = ECR.match(image)
            if ecr:
                contexts["account"].add(ecr.group(1))
                contexts["region"].add(ecr.group(2))
        logging = container.get("logConfiguration") or {}
        if not isinstance(logging, dict) or not isinstance(logging.get("options", {}), dict):
            raise ConfigurationError("The configured log options must be an object")
        log_region = logging.get("options", {}).get("awslogs-region")
        if log_region:
            if not isinstance(log_region, str) or not REGION.fullmatch(log_region):
                raise ConfigurationError("The configured log region has invalid syntax")
            contexts["region"].add(log_region)
    for reference in references:
        partition, _, secret_region, account, resource = database_reference(reference)
        contexts["partition"].add(partition)
        contexts["region"].add(secret_region)
        contexts["account"].add(account)
        # Only the secret name/path carries environment identity. JSON key and version
        # selectors are not environment names and are preserved verbatim.
        name = resource[7:].split(":")[0] if resource.startswith("secret:") else resource[10:]
        contexts["environment"].update(match.lower() for match in ENVIRONMENT_TOKEN.findall(name))
    if any(len(values) > 1 for values in contexts.values()):
        raise ConfigurationError("Worker, API and database reference disagree on environment, region, account or partition")


def configure_worker_import_runtime(
    worker_definition: dict[str, Any], api_definition: dict[str, Any], *,
    environment: str | None = None, region: str | None = None, account_id: str | None = None,
) -> dict[str, Any]:
    worker = primary_container(worker_definition, "worker")
    api = primary_container(api_definition, "api")
    worker_env, worker_secrets = checked_entries(worker)
    api_env, api_secrets = checked_entries(api)
    if any(name in worker_secrets for name in TLS_ENVIRONMENT):
        raise ConfigurationError("The worker TLS policy must not be overridden by secret entries")
    if "APP_ENV" in worker_secrets or "APP_ENV" in api_secrets:
        raise ConfigurationError("APP_ENV must be an explicit non-secret setting")
    own = worker_secrets.get("DATABASE_URL")
    source = api_secrets.get("DATABASE_URL")
    selected = own or source
    if selected is None:
        raise ConfigurationError("Neither the worker nor the API supplies an approved DATABASE_URL secret reference")
    references = [entry["valueFrom"] for entry in (own, source) if entry is not None]
    validate_context(worker_definition, api_definition, worker_env, api_env, references,
                     environment=environment, region=region, account_id=account_id)
    configured = copy.deepcopy(worker_definition)
    target = configured["containerDefinitions"][0]
    if own is None:
        # Deliberately select two fields, not the whole entry/container/API environment.
        target.setdefault("secrets", []).append({"name": "DATABASE_URL", "valueFrom": selected["valueFrom"]})
    target["environment"] = [entry for entry in target.get("environment", []) if entry["name"] not in TLS_ENVIRONMENT]
    target["environment"].extend({"name": name, "value": value} for name, value in TLS_ENVIRONMENT.items())
    target["healthCheck"] = worker_health_check(target.get("healthCheck"))
    return configured


def check_worker_import_runtime(worker: dict[str, Any], api: dict[str, Any], **context: Any) -> None:
    expected = configure_worker_import_runtime(worker, api, **context)
    if expected != worker:
        raise ConfigurationError("The worker is missing the approved database reference, verified TLS or readiness configuration")


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ConfigurationError("Duplicate JSON object keys are ambiguous")
        value[key] = item
    return value


def read_definition(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(), object_pairs_hook=unique_object)
    except json.JSONDecodeError as error:
        raise ConfigurationError("A task definition input is not valid JSON") from error
    if not isinstance(value, dict):
        raise ConfigurationError("Each input must be a task definition JSON object")
    return value


def write_definition(path: Path, value: dict[str, Any]) -> None:
    # Protect files even if the runner's umask is permissive, and do not truncate an
    # existing plan on validation/serialization failure.
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = stream.name
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--environment", choices=("qas", "prd"))
    parser.add_argument("--region")
    parser.add_argument("--account-id")
    parser.add_argument("worker", type=Path)
    parser.add_argument("api", type=Path)
    parser.add_argument("output", type=Path, nargs="?")
    args = parser.parse_args()
    if args.check and args.output is not None:
        parser.error("--check does not write an output file")
    if not args.check and args.output is None:
        parser.error("An output path is required")
    try:
        worker, api = read_definition(args.worker), read_definition(args.api)
        context = {"environment": args.environment, "region": args.region, "account_id": args.account_id}
        if args.check:
            check_worker_import_runtime(worker, api, **context)
        else:
            configured = configure_worker_import_runtime(worker, api, **context)
            write_definition(args.output, configured)
    except ConfigurationError as error:
        print(f"Cannot configure worker import runtime: {error}", file=sys.stderr)
        return 1
    except (OSError, TypeError, ValueError, AttributeError):
        # Do not print arbitrary exceptions: legacy task definitions may contain secrets.
        print("Cannot configure worker import runtime: invalid input or inaccessible plan file", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
