#!/usr/bin/env python3
"""Add the private ClamAV sidecar to a registerable API Fargate task definition.

Usage: python3 scripts/configure-api-file-protection.py INPUT.json OUTPUT.json
       python3 scripts/configure-api-file-protection.py --check RUNNING.json

This is a local, deterministic JSON transformation. It neither calls AWS nor changes IAM.
The API stays first because deployment and migration tooling identify it by index.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any


CLAMAV_NAME = "clamav"
CLAMAV_IMAGE = (
    "clamav/clamav:1.5.4@sha256:"
    "e19130cdebaeacc71fa46eab3ed6f69941f2f22aa5e08d55e9197f8edf43ce5e"
)
CLAMAV_CPU = 512
CLAMAV_MEMORY = 4096
MINIMUM_TASK_MEMORY = 6144
API_ENVIRONMENT = {
    "MALWARE_SCAN_DRIVER": "clamav",
    "CLAMAV_HOST": "127.0.0.1",
    "CLAMAV_PORT": "3310",
    "CLAMAV_TIMEOUT_MS": "30000",
    "FILE_CLEANUP_ENABLED": "true",
}
# The pinned official image ships #TCPAddr commented; /init replaces that line.
# Leave its original entrypoint in control of freshclam and daemon startup.
CLAMAV_ENVIRONMENT = {
    "TZ": "UTC",
    "CLAMD_CONF_TCPAddr": "127.0.0.1",
    "CLAMD_CONF_TCPSocket": "3310",
    "CLAMD_CONF_MaxThreads": "2",
    "CLAMD_CONF_StreamMaxLength": "64M",
    "CLAMD_CONF_MaxFileSize": "64M",
    "CLAMD_CONF_MaxScanSize": "256M",
    "CLAMD_CONF_MaxRecursion": "16",
    "CLAMD_CONF_MaxFiles": "1000",
    "CLAMD_CONF_MaxScanTime": "20000",
    "CLAMD_CONF_AlertExceedsMax": "yes",
    "CLAMD_CONF_AlertEncrypted": "yes",
    "CLAMD_CONF_ConcurrentDatabaseReload": "no",
    "CLAMD_CONF_FailIfCvdOlderThan": "7",
    "FRESHCLAM_CHECKS": "12",
    "CLAMAV_NO_MILTERD": "true",
}
# https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
FARGATE_SIZES = (
    (256, (512, 1024, 2048)),
    (512, (1024, 2048, 3072, 4096)),
    (1024, tuple(range(2048, 8193, 1024))),
    (2048, tuple(range(4096, 16385, 1024))),
    (4096, tuple(range(8192, 30721, 1024))),
    (8192, tuple(range(16384, 61441, 4096))),
    (16384, tuple(range(32768, 122881, 8192))),
    (32768, (61440, 122880, 249856)),
)


def units(value: Any, label: str) -> int:
    if isinstance(value, bool) or not re.fullmatch(r"\d+", str(value)):
        raise ValueError(f"{label} must be a non-negative integer in ECS units")
    return int(value)


def task_size(cpu: int, memory: int) -> tuple[int, int]:
    for supported_cpu, supported_memories in FARGATE_SIZES:
        if supported_cpu < cpu:
            continue
        for supported_memory in supported_memories:
            if supported_memory >= memory:
                return supported_cpu, supported_memory
    raise ValueError("The combined containers exceed supported Fargate task sizes")


def environment_values(values: dict[str, str]) -> list[dict[str, str]]:
    return [{"name": name, "value": value} for name, value in values.items()]


def configure_api_file_protection(definition: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(definition)
    if result.get("networkMode") != "awsvpc":
        raise ValueError("The API task must use awsvpc for private loopback scanning")
    if "FARGATE" not in result.get("requiresCompatibilities", []):
        raise ValueError("The API task must declare FARGATE compatibility")
    runtime = result.get("runtimePlatform", {})
    if runtime.get("cpuArchitecture", "X86_64") != "X86_64":
        raise ValueError("The pinned ClamAV image supports only X86_64")
    if runtime.get("operatingSystemFamily", "LINUX") != "LINUX":
        raise ValueError("Private loopback scanning requires a Linux API task")

    containers = result.get("containerDefinitions")
    if not isinstance(containers, list) or not containers or not all(
        isinstance(container, dict) and isinstance(container.get("name"), str)
        for container in containers
    ):
        raise ValueError("An API container must be present at index zero")
    api = containers[0]
    if api["name"] == CLAMAV_NAME:
        raise ValueError("The API container must remain at index zero")
    retained = [api, *(item for item in containers[1:] if item["name"] != CLAMAV_NAME)]
    if any(item.get("name") in API_ENVIRONMENT for item in api.get("secrets", [])):
        raise ValueError("Scanner configuration conflicts with an existing API secret name")
    api["environment"] = [
        item
        for item in api.get("environment", [])
        if item.get("name") not in API_ENVIRONMENT
    ] + environment_values(API_ENVIRONMENT)
    api["dependsOn"] = [
        item for item in api.get("dependsOn", []) if item.get("containerName") != CLAMAV_NAME
    ] + [{"containerName": CLAMAV_NAME, "condition": "HEALTHY"}]
    api["startTimeout"] = 120

    logging = copy.deepcopy(api.get("logConfiguration"))
    if not isinstance(logging, dict) or logging.get("logDriver") != "awslogs":
        raise ValueError("The API must provide awslogs configuration for scanner diagnostics")
    logging.setdefault("options", {})["awslogs-stream-prefix"] = CLAMAV_NAME
    scanner = {
        "name": CLAMAV_NAME,
        "image": CLAMAV_IMAGE,
        "essential": True,
        "cpu": CLAMAV_CPU,
        "memory": CLAMAV_MEMORY,
        "environment": environment_values(CLAMAV_ENVIRONMENT),
        "healthCheck": {
            "command": ["CMD", "clamdcheck.sh"],
            "interval": 30,
            "timeout": 5,
            "retries": 3,
            "startPeriod": 300,
        },
        "logConfiguration": logging,
    }
    result["containerDefinitions"] = [*retained, scanner]
    required_cpu = max(
        units(result.get("cpu"), "Task CPU"),
        sum(units(item.get("cpu", 0), "Container CPU") for item in retained) + CLAMAV_CPU,
    )
    required_memory = max(
        units(result.get("memory"), "Task memory"),
        MINIMUM_TASK_MEMORY,
        sum(
            max(
                units(item.get("memory", 0), "Container memory"),
                units(item.get("memoryReservation", 0), "Container reserved memory"),
            )
            for item in retained
        )
        + CLAMAV_MEMORY,
    )
    cpu, memory = task_size(required_cpu, required_memory)
    result["cpu"], result["memory"] = str(cpu), str(memory)
    return result


def check_api_file_protection(definition: dict[str, Any]) -> None:
    """Fail closed on the definition ECS reports after deployment, without rewriting it."""
    if definition.get("networkMode") != "awsvpc":
        raise ValueError("The running API task must use awsvpc")
    if "FARGATE" not in definition.get("requiresCompatibilities", []):
        raise ValueError("The running API task must declare FARGATE compatibility")
    runtime = definition.get("runtimePlatform", {})
    if (
        runtime.get("cpuArchitecture", "X86_64") != "X86_64"
        or runtime.get("operatingSystemFamily", "LINUX") != "LINUX"
    ):
        raise ValueError("The running scanner requires Linux X86_64")
    containers = definition.get("containerDefinitions")
    if not isinstance(containers, list) or not containers or not all(
        isinstance(container, dict) and isinstance(container.get("name"), str)
        for container in containers
    ):
        raise ValueError("The running API container must be present at index zero")
    api = containers[0]
    scanners = [container for container in containers if container["name"] == CLAMAV_NAME]
    if api["name"] == CLAMAV_NAME or len(scanners) != 1:
        raise ValueError("The running task must have one scanner after the API container")
    scanner = scanners[0]
    if scanner.get("image") != CLAMAV_IMAGE or scanner.get("essential") is not True:
        raise ValueError("The running scanner must use the pinned image and be essential")
    if scanner.get("entryPoint") or scanner.get("command") or scanner.get("portMappings"):
        raise ValueError("The running scanner must keep its original startup and private ports")
    for container, required in ((api, API_ENVIRONMENT), (scanner, CLAMAV_ENVIRONMENT)):
        environment = container.get("environment", [])
        if not isinstance(environment, list) or not all(isinstance(item, dict) for item in environment):
            raise ValueError("The running scanner configuration must contain environment entries")
        for name, value in required.items():
            if [item.get("value") for item in environment if item.get("name") == name] != [value]:
                raise ValueError("The running scanner configuration does not match the required policy")
        if any(item.get("name") in required for item in container.get("secrets", [])):
            raise ValueError("The running scanner configuration must not be overridden by secrets")
    if len(scanner.get("environment", [])) != len(CLAMAV_ENVIRONMENT) or scanner.get("secrets"):
        raise ValueError("The running scanner must not override official daemon startup options")
    if [item for item in api.get("dependsOn", []) if item.get("containerName") == CLAMAV_NAME] != [
        {"containerName": CLAMAV_NAME, "condition": "HEALTHY"}
    ] or api.get("startTimeout") != 120:
        raise ValueError("The running API must wait for the healthy scanner")
    if scanner.get("healthCheck") != {
        "command": ["CMD", "clamdcheck.sh"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 300,
    }:
        raise ValueError("The running scanner health check does not match the required policy")
    if (
        units(scanner.get("cpu"), "Scanner CPU") < CLAMAV_CPU
        or units(scanner.get("memory"), "Scanner memory") < CLAMAV_MEMORY
    ):
        raise ValueError("The running scanner does not have its required resources")
    cpu, memory = units(definition.get("cpu"), "Task CPU"), units(definition.get("memory"), "Task memory")
    if (
        (cpu, memory) != task_size(cpu, memory)
        or cpu < sum(units(item.get("cpu", 0), "Container CPU") for item in containers)
        or memory < max(MINIMUM_TASK_MEMORY, sum(
            max(
                units(item.get("memory", 0), "Container memory"),
                units(item.get("memoryReservation", 0), "Container reserved memory"),
            )
            for item in containers
        ))
    ):
        raise ValueError("The running task does not have a valid scanner resource envelope")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify a running definition without changing it")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path, nargs="?")
    args = parser.parse_args()
    if args.check and args.output is not None:
        parser.error("--check accepts only the input definition")
    if not args.check and args.output is None:
        parser.error("An output path is required when configuring a definition")
    try:
        definition = json.loads(args.input.read_text())
        if not isinstance(definition, dict):
            raise ValueError("The input must be a task definition JSON object")
        if args.check:
            check_api_file_protection(definition)
        else:
            configured = configure_api_file_protection(definition)
            args.output.write_text(json.dumps(configured, indent=2, ensure_ascii=False) + "\n")
    except (OSError, ValueError, TypeError) as error:
        # Never print the task definition: environments can contain legacy sensitive values.
        action = "verify" if args.check else "configure"
        print(f"Cannot {action} API file protection: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
