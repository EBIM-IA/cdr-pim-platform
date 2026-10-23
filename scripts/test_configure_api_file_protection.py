from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("configure-api-file-protection.py")
SPEC = importlib.util.spec_from_file_location("configure_api_file_protection", SCRIPT)
assert SPEC and SPEC.loader
PROTECTION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROTECTION)


def task_definition() -> dict:
    return {
        "family": "api-fixture",
        "networkMode": "awsvpc",
        "requiresCompatibilities": ["FARGATE"],
        "runtimePlatform": {"cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX"},
        "cpu": "512",
        "memory": "1024",
        "taskRoleArn": "unchanged-task-role",
        "executionRoleArn": "unchanged-execution-role",
        "ephemeralStorage": {"sizeInGiB": 40},
        "volumes": [{"name": "existing-volume"}],
        "enableFaultInjection": False,
        "tags": [{"key": "existing", "value": "preserved"}],
        "containerDefinitions": [
            {
                "name": "api",
                "image": "api-image-preserved",
                "cpu": 256,
                "memory": 512,
                "command": ["node", "dist/main.js"],
                "portMappings": [{"containerPort": 3001, "protocol": "tcp"}],
                "environment": [{"name": "APP_VERSION", "value": "unchanged-version"}],
                "secrets": [{"name": "DATABASE_URL", "valueFrom": "unchanged-secret-reference"}],
                "dependsOn": [{"containerName": "telemetry", "condition": "START"}],
                "healthCheck": {"command": ["CMD", "node", "health.js"]},
                "logConfiguration": {
                    "logDriver": "awslogs",
                    "options": {
                        "awslogs-group": "/existing/api",
                        "awslogs-region": "existing-region",
                        "awslogs-stream-prefix": "api",
                    },
                },
                "mountPoints": [{"sourceVolume": "existing-volume", "containerPath": "/data"}],
            },
            {"name": "telemetry", "image": "unchanged-observer", "cpu": 128, "memory": 128},
        ],
    }


class ConfigureApiFileProtectionTest(unittest.TestCase):
    def test_preserves_api_index_resources_roles_secrets_and_unknown_sidecar_fields(self) -> None:
        source = task_definition()
        original = copy.deepcopy(source)
        configured = PROTECTION.configure_api_file_protection(source)
        self.assertEqual(source, original)
        self.assertEqual(configured["containerDefinitions"][0]["name"], "api")
        for key in set(original) - {"containerDefinitions", "cpu", "memory"}:
            self.assertEqual(configured[key], original[key])
        for key in set(original["containerDefinitions"][0]) - {"environment", "dependsOn"}:
            self.assertEqual(
                configured["containerDefinitions"][0][key], original["containerDefinitions"][0][key]
            )
        self.assertEqual(configured["containerDefinitions"][1], original["containerDefinitions"][1])
        self.assertEqual((configured["cpu"], configured["memory"]), ("1024", "6144"))

    def test_keeps_original_entrypoint_and_private_loopback_with_bounded_scanning(self) -> None:
        configured = PROTECTION.configure_api_file_protection(task_definition())
        api, scanner = configured["containerDefinitions"][0], configured["containerDefinitions"][-1]
        self.assertEqual(scanner["name"], "clamav")
        self.assertEqual(scanner["image"], PROTECTION.CLAMAV_IMAGE)
        self.assertTrue(scanner["image"].endswith(
            "@sha256:e19130cdebaeacc71fa46eab3ed6f69941f2f22aa5e08d55e9197f8edf43ce5e"
        ))
        self.assertIs(scanner["essential"], True)
        self.assertEqual((scanner["cpu"], scanner["memory"]), (512, 4096))
        self.assertNotIn("entryPoint", scanner)
        self.assertNotIn("command", scanner)
        self.assertNotIn("portMappings", scanner)
        scanner_env = {item["name"]: item["value"] for item in scanner["environment"]}
        self.assertEqual(scanner_env, PROTECTION.CLAMAV_ENVIRONMENT)
        self.assertEqual(scanner_env["CLAMD_CONF_TCPAddr"], "127.0.0.1")
        self.assertEqual(scanner_env["CLAMD_CONF_MaxScanTime"], "20000")
        self.assertEqual(scanner_env["CLAMD_CONF_StreamMaxLength"], "64M")
        self.assertEqual(scanner_env["CLAMD_CONF_FailIfCvdOlderThan"], "7")
        self.assertEqual(scanner_env["FRESHCLAM_CHECKS"], "12")
        self.assertNotIn("CLAMAV_NO_FRESHCLAMD", scanner_env)
        self.assertEqual(scanner["healthCheck"], {
            "command": ["CMD-SHELL", "printf 'nPING\\n' | nc -w 3 127.0.0.1 3310 | grep -qx PONG"], "interval": 30, "timeout": 5,
            "retries": 3, "startPeriod": 300,
        })
        self.assertEqual(api["startTimeout"], 120)
        api_env = {item["name"]: item["value"] for item in api["environment"]}
        self.assertEqual(api_env["CLAMAV_TIMEOUT_MS"], "30000")
        self.assertEqual(api_env["MALWARE_SCAN_DRIVER"], "clamav")
        self.assertEqual(api_env["FILE_CLEANUP_ENABLED"], "true")
        self.assertEqual(scanner["logConfiguration"]["options"]["awslogs-group"], "/existing/api")
        self.assertEqual(scanner["logConfiguration"]["options"]["awslogs-stream-prefix"], "clamav")
        self.assertEqual(api["logConfiguration"]["options"]["awslogs-stream-prefix"], "api")

    def test_ipv4_health_command_sends_newline_framed_ping_and_requires_exact_pong(self) -> None:
        command = PROTECTION.configure_api_file_protection(task_definition())["containerDefinitions"][-1]["healthCheck"]["command"]
        self.assertEqual(command[0], "CMD-SHELL")
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            capture = folder / "request"
            nc = folder / "nc"
            nc.write_text(
                f'#!{sys.executable}\n'
                'import os, sys\n'
                'from pathlib import Path\n'
                'if sys.argv[1:] != ["-w", "3", "127.0.0.1", "3310"]: sys.exit(9)\n'
                'Path(os.environ["HEALTH_CAPTURE"]).write_bytes(sys.stdin.buffer.read())\n'
                'sys.stdout.write(os.environ["HEALTH_RESPONSE"])\n'
            )
            nc.chmod(0o700)
            for response, accepted in [("PONG\n", True), ("PONG altered\n", False), ("NOT PONG\n", False), ("", False)]:
                with self.subTest(response=response):
                    result = subprocess.run(["/bin/sh", "-c", command[1]], capture_output=True, check=False,
                                            env={**os.environ, "PATH": f"{folder}{os.pathsep}{os.environ['PATH']}",
                                                 "HEALTH_CAPTURE": str(capture), "HEALTH_RESPONSE": response}, timeout=5)
                    self.assertEqual(result.returncode == 0, accepted)
                    self.assertEqual(capture.read_bytes(), b"nPING\n")

    def test_replaces_old_scanner_and_deduplicates_its_environment_and_dependency_idempotently(self) -> None:
        source = task_definition()
        source["containerDefinitions"][0]["environment"] += [
            {"name": "MALWARE_SCAN_DRIVER", "value": "disabled"},
            {"name": "MALWARE_SCAN_DRIVER", "value": "disabled"},
            {"name": "CLAMAV_HOST", "value": "old-host"},
        ]
        source["containerDefinitions"][0]["dependsOn"] += [
            {"containerName": "clamav", "condition": "START"},
            {"containerName": "clamav", "condition": "COMPLETE"},
        ]
        source["containerDefinitions"].insert(1, {
            "name": "clamav", "image": "old-scanner", "command": ["old-command"],
            "portMappings": [{"containerPort": 3310}], "memory": 512,
        })
        configured = PROTECTION.configure_api_file_protection(source)
        self.assertEqual(PROTECTION.configure_api_file_protection(configured), configured)
        self.assertEqual([item["name"] for item in configured["containerDefinitions"]], ["api", "telemetry", "clamav"])
        api = configured["containerDefinitions"][0]
        self.assertEqual(api["dependsOn"], [
            {"containerName": "telemetry", "condition": "START"},
            {"containerName": "clamav", "condition": "HEALTHY"},
        ])
        for name in PROTECTION.API_ENVIRONMENT:
            self.assertEqual(sum(item["name"] == name for item in api["environment"]), 1)

    def test_preserves_larger_task_resources(self) -> None:
        source = task_definition()
        source["cpu"], source["memory"] = "2048", "12288"
        configured = PROTECTION.configure_api_file_protection(source)
        self.assertEqual((configured["cpu"], configured["memory"]), ("2048", "12288"))

    def test_rounds_up_for_api_and_other_container_limits_without_reducing_them(self) -> None:
        source = task_definition()
        source["cpu"], source["memory"] = "4096", "8192"
        source["containerDefinitions"][0]["cpu"] = 4096
        source["containerDefinitions"][0]["memory"] = 8192
        configured = PROTECTION.configure_api_file_protection(source)
        self.assertEqual((configured["cpu"], configured["memory"]), ("8192", "16384"))
        self.assertEqual(configured["containerDefinitions"][0]["cpu"], 4096)
        self.assertEqual(configured["containerDefinitions"][0]["memory"], 8192)
        source["containerDefinitions"][1]["memoryReservation"] = 20000
        configured = PROTECTION.configure_api_file_protection(source)
        self.assertEqual((configured["cpu"], configured["memory"]), ("8192", "32768"))

    def test_fargate_boundaries_and_impossible_sizes_fail_locally(self) -> None:
        self.assertEqual(PROTECTION.task_size(512, 6144), (1024, 6144))
        self.assertEqual(PROTECTION.task_size(2048, 17000), (4096, 17408))
        self.assertEqual(PROTECTION.task_size(4096, 30721), (8192, 32768))
        self.assertEqual(PROTECTION.task_size(16384, 122881), (32768, 249856))
        self.assertEqual(PROTECTION.task_size(32768, 249856), (32768, 249856))
        for cpu, memory in [(32769, 6144), (1024, 249857)]:
            with self.subTest(cpu=cpu, memory=memory), self.assertRaises(ValueError):
                PROTECTION.task_size(cpu, memory)

    def test_rejects_incompatible_network_architecture_or_conflicting_secret_configuration(self) -> None:
        for mutation in [
            {"networkMode": "bridge"},
            {"requiresCompatibilities": ["EC2"]},
            {"runtimePlatform": {"cpuArchitecture": "ARM64"}},
            {"runtimePlatform": {"operatingSystemFamily": "WINDOWS_SERVER_2025_CORE"}},
            {"cpu": "-1"},
            {"memory": True},
            {"containerDefinitions": []},
        ]:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                PROTECTION.configure_api_file_protection({**task_definition(), **mutation})
        source = task_definition()
        source["containerDefinitions"][0]["secrets"].append({"name": "CLAMAV_HOST", "valueFrom": "unchanged-scanner-secret"})
        with self.assertRaisesRegex(ValueError, "conflicts"):
            PROTECTION.configure_api_file_protection(source)

    def test_cli_only_writes_a_local_definition_and_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "input.json"
            destination = Path(directory) / "output.json"
            source.write_text(json.dumps(task_definition()))
            result = subprocess.run([sys.executable, str(SCRIPT), str(source), str(destination)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertEqual(json.loads(destination.read_text()), PROTECTION.configure_api_file_protection(task_definition()))

    def test_checks_the_reported_definition_without_repairing_or_mutating_it(self) -> None:
        reported = PROTECTION.configure_api_file_protection(task_definition())
        reported.update({"taskDefinitionArn": "reported-api-revision", "revision": 42, "status": "ACTIVE"})
        original = copy.deepcopy(reported)
        PROTECTION.check_api_file_protection(reported)
        self.assertEqual(reported, original)
        reported["containerDefinitions"][-1]["image"] = "unexpected-scanner-image"
        with self.assertRaisesRegex(ValueError, "pinned image"):
            PROTECTION.check_api_file_protection(reported)
        self.assertEqual(reported["containerDefinitions"][-1]["image"], "unexpected-scanner-image")

    def test_running_check_rejects_missing_disabled_or_exposed_protection(self) -> None:
        mutations = [
            lambda td: td.update(networkMode="bridge"),
            lambda td: td.update(runtimePlatform={"cpuArchitecture": "ARM64"}),
            lambda td: td["containerDefinitions"].pop(),
            lambda td: td["containerDefinitions"].append(copy.deepcopy(td["containerDefinitions"][-1])),
            lambda td: td["containerDefinitions"].reverse(),
            lambda td: td["containerDefinitions"][-1].update(essential=False),
            lambda td: td["containerDefinitions"][-1].update(command=["sleep", "infinity"]),
            lambda td: td["containerDefinitions"][-1].update(entryPoint=["sh"]),
            lambda td: td["containerDefinitions"][-1].update(portMappings=[{"containerPort": 3310}]),
            lambda td: td["containerDefinitions"][-1].update(memory=2048),
            lambda td: td["containerDefinitions"][-1].update(cpu=256),
            lambda td: td["containerDefinitions"][-1].update(healthCheck={"command": ["CMD", "true"]}),
            lambda td: td["containerDefinitions"][-1]["healthCheck"].update(command=["CMD", "clamdcheck.sh"]),
            lambda td: td["containerDefinitions"][0].update(dependsOn=[]),
            lambda td: td["containerDefinitions"][0].update(startTimeout=1),
            lambda td: td.update(memory="4096"),
            lambda td: td.update(cpu="512"),
            lambda td: td["containerDefinitions"][-1]["environment"].append({"name": "CLAMAV_NO_FRESHCLAMD", "value": "true"}),
            lambda td: td["containerDefinitions"][0]["environment"].append({"name": "MALWARE_SCAN_DRIVER", "value": "disabled"}),
            lambda td: td["containerDefinitions"][0]["secrets"].append({"name": "FILE_CLEANUP_ENABLED", "valueFrom": "unexpected-override"}),
            lambda td: td["containerDefinitions"][-1].update(secrets=[{"name": "TZ", "valueFrom": "unexpected-override"}]),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                reported = PROTECTION.configure_api_file_protection(task_definition())
                mutate(reported)
                with self.assertRaises(ValueError):
                    PROTECTION.check_api_file_protection(reported)
        for container_index, name, replacement in [
            (0, "MALWARE_SCAN_DRIVER", "disabled"),
            (0, "FILE_CLEANUP_ENABLED", "false"),
            (0, "CLAMAV_HOST", "external-host"),
            (-1, "CLAMD_CONF_TCPAddr", "0.0.0.0"),
            (-1, "TZ", "America/Lima"),
            (-1, "FRESHCLAM_CHECKS", "0"),
        ]:
            with self.subTest(environment=name):
                reported = PROTECTION.configure_api_file_protection(task_definition())
                next(item for item in reported["containerDefinitions"][container_index]["environment"] if item["name"] == name)["value"] = replacement
                with self.assertRaises(ValueError):
                    PROTECTION.check_api_file_protection(reported)

    def test_check_cli_does_not_write_files_or_print_definition_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "running.json"
            reported = PROTECTION.configure_api_file_protection(task_definition())
            reported["containerDefinitions"][0]["environment"].append({"name": "LEGACY_SECRET", "value": "never-print-this-value"})
            source.write_text(json.dumps(reported))
            original = source.read_bytes()
            command = [sys.executable, str(SCRIPT), "--check", str(source)]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout + result.stderr, "")
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(list(Path(directory).iterdir()), [source])
            reported["containerDefinitions"][-1]["image"] = "never-print-this-image-value"
            source.write_text(json.dumps(reported))
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertIn("Cannot verify API file protection", result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertNotIn("never-print", result.stderr)


if __name__ == "__main__":
    unittest.main()
