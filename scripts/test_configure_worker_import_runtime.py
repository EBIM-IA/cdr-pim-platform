from __future__ import annotations

import copy
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("configure-worker-import-runtime.py")
SPEC = importlib.util.spec_from_file_location("configure_worker_import_runtime", SCRIPT)
assert SPEC and SPEC.loader
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)

ACCOUNT = "123456789012"
REGION = "us-east-1"


def secret(environment: str = "qas", suffix: str = "database-AbCdEf:DATABASE_URL::") -> str:
    return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:cdr-pim/{environment}/{suffix}"


def task(kind: str, environment: str = "qas") -> dict:
    return {
        "family": f"cdr-pim-{environment}-{kind}",
        "taskDefinitionArn": f"arn:aws:ecs:{REGION}:{ACCOUNT}:task-definition/cdr-pim-{environment}-{kind}:17",
        "taskRoleArn": f"arn:aws:iam::{ACCOUNT}:role/cdr-pim-{environment}-{kind}",
        "executionRoleArn": f"arn:aws:iam::{ACCOUNT}:role/cdr-pim-{environment}-execution",
        "networkMode": "awsvpc",
        "requiresCompatibilities": ["FARGATE"],
        "cpu": "512",
        "memory": "1024",
        "ephemeralStorage": {"sizeInGiB": 40},
        "volumes": [{"name": "existing-volume"}],
        "tags": [{"key": "existing", "value": "preserved"}],
        "containerDefinitions": [
            {
                "name": kind,
                "image": f"{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/cdr-pim-{kind}@sha256:unchanged",
                "cpu": 256,
                "memory": 512,
                "portMappings": [{"containerPort": 3002, "protocol": "tcp"}],
                "environment": [
                    {"name": "APP_ENV", "value": environment},
                    {"name": "APP_VERSION", "value": "existing-version"},
                    {"name": "SQS_QUEUE_URL", "value": "unchanged-queue"},
                ],
                "secrets": [{"name": "EXISTING_TOKEN", "valueFrom": "unchanged-existing-token"}],
                "dependsOn": [{"containerName": "telemetry", "condition": "START"}],
                "mountPoints": [{"sourceVolume": "existing-volume", "containerPath": "/data"}],
                "logConfiguration": {
                    "logDriver": "awslogs",
                    "options": {"awslogs-region": REGION, "awslogs-group": f"/cdr/{environment}/{kind}"},
                },
            },
            {"name": "telemetry", "image": "existing-observer", "environment": [{"name": "PORT", "value": "4000"}]},
        ],
    }


def definitions(environment: str = "qas") -> tuple[dict, dict]:
    worker, api = task("worker", environment), task("api", environment)
    api["containerDefinitions"][0]["secrets"].append({"name": "DATABASE_URL", "valueFrom": secret(environment)})
    return worker, api


class ConfigureWorkerImportRuntimeTest(unittest.TestCase):
    def test_borrows_only_database_reference_and_preserves_unrelated_runtime(self) -> None:
        worker, api = definitions()
        api["containerDefinitions"][0]["environment"].append({"name": "API_ONLY", "value": "do-not-copy"})
        api["containerDefinitions"][0]["secrets"][-1]["extra"] = "do-not-copy"
        original_worker, original_api = copy.deepcopy(worker), copy.deepcopy(api)
        configured = RUNTIME.configure_worker_import_runtime(worker, api)
        self.assertEqual((worker, api), (original_worker, original_api))
        expected = copy.deepcopy(worker)
        target = expected["containerDefinitions"][0]
        target["secrets"].append({"name": "DATABASE_URL", "valueFrom": secret()})
        target["environment"] += [
            {"name": "DATABASE_SSL", "value": "true"},
            {"name": "DATABASE_SSL_CA_FILE", "value": "/app/certs/rds-global-bundle.pem"},
        ]
        target["healthCheck"] = {
            "command": ["CMD", "node", "-e", RUNTIME.HEALTH_SCRIPT],
            "interval": 30, "timeout": 5, "startPeriod": 30, "retries": 3,
        }
        self.assertEqual(configured, expected)

    def test_keeps_existing_worker_secret_even_when_api_uses_another_secret(self) -> None:
        worker, api = definitions()
        own = {"name": "DATABASE_URL", "valueFrom": secret(suffix="worker-db-AbCdEf"), "preserved": "yes"}
        worker["containerDefinitions"][0]["secrets"].append(own)
        configured = RUNTIME.configure_worker_import_runtime(worker, api)
        self.assertEqual(configured["containerDefinitions"][0]["secrets"], worker["containerDefinitions"][0]["secrets"])
        del api["containerDefinitions"][0]["secrets"][-1]
        self.assertEqual(RUNTIME.configure_worker_import_runtime(worker, api), configured)

    def test_qas_and_prd_accept_only_matching_explicit_context_and_are_idempotent(self) -> None:
        for environment in ("qas", "prd"):
            with self.subTest(environment=environment):
                worker, api = definitions(environment)
                context = {"environment": environment, "region": REGION, "account_id": ACCOUNT}
                configured = RUNTIME.configure_worker_import_runtime(worker, api, **context)
                self.assertEqual(RUNTIME.configure_worker_import_runtime(configured, api, **context), configured)
                RUNTIME.check_worker_import_runtime(configured, api, **context)
                with self.assertRaises(RUNTIME.ConfigurationError):
                    RUNTIME.check_worker_import_runtime(worker, api, **context)

    def test_normalizes_insecure_tls_settings_without_copying_api_environment(self) -> None:
        worker, api = definitions()
        worker["containerDefinitions"][0]["environment"] += [
            {"name": "DATABASE_SSL", "value": "false"},
            {"name": "DATABASE_SSL_CA_FILE", "value": "/tmp/incorrect.pem"},
        ]
        api["containerDefinitions"][0]["environment"].append({"name": "PORT", "value": "3001"})
        configured = RUNTIME.configure_worker_import_runtime(worker, api)
        values = {entry["name"]: entry["value"] for entry in configured["containerDefinitions"][0]["environment"]}
        self.assertEqual(values["DATABASE_SSL"], "true")
        self.assertEqual(values["DATABASE_SSL_CA_FILE"], "/app/certs/rds-global-bundle.pem")
        self.assertNotIn("PORT", values)

    def test_accepts_exact_secrets_manager_selectors_and_ssm_reference(self) -> None:
        for reference in (
            secret(suffix="database-AbCdEf"),
            secret(),
            secret(suffix="database-AbCdEf:DATABASE_URL:AWSCURRENT:"),
            secret(suffix="database-AbCdEf:DATABASE_URL::" + "a" * 32),
            f"arn:aws:ssm:{REGION}:{ACCOUNT}:parameter/cdr-pim/qas/database-url",
        ):
            with self.subTest(reference=reference):
                worker, api = definitions()
                api["containerDefinitions"][0]["secrets"][-1]["valueFrom"] = reference
                self.assertEqual(RUNTIME.configure_worker_import_runtime(worker, api)["containerDefinitions"][0]["secrets"][-1]["valueFrom"], reference)

    def test_rejects_plaintext_missing_malformed_or_ambiguous_database_sources(self) -> None:
        for invalid in (
            "postgresql://DO_NOT_LEAK:password@example.invalid/db",
            "", "database-url", f"arn:aws:s3:{REGION}:{ACCOUNT}:bucket/db",
            f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:parameter/not-a-secret",
            secret(suffix="database-AbCdEf:DATABASE_URL:AWSCURRENT:version"),
            secret(suffix="database-AbCdEf:incomplete-selector"),
            f"arn:aws:ssm:{REGION}:{ACCOUNT}:secret/not-a-parameter",
        ):
            with self.subTest(invalid=invalid):
                worker, api = definitions()
                api["containerDefinitions"][0]["secrets"][-1]["valueFrom"] = invalid
                with self.assertRaises(RUNTIME.ConfigurationError) as failure:
                    RUNTIME.configure_worker_import_runtime(worker, api)
                self.assertNotIn("DO_NOT_LEAK", str(failure.exception))
        worker, api = definitions()
        api["containerDefinitions"][0]["secrets"].pop()
        with self.assertRaises(RUNTIME.ConfigurationError):
            RUNTIME.configure_worker_import_runtime(worker, api)

    def test_rejects_plaintext_even_if_a_valid_reference_is_already_present(self) -> None:
        for kind in ("worker", "api"):
            for value in ("", "postgresql://DO_NOT_LEAK:password@example.invalid/db"):
                with self.subTest(kind=kind, value=value):
                    worker, api = definitions()
                    worker["containerDefinitions"][0]["secrets"].append({"name": "DATABASE_URL", "valueFrom": secret()})
                    target = worker if kind == "worker" else api
                    target["containerDefinitions"][0]["environment"].append({"name": "DATABASE_URL", "value": value})
                    with self.assertRaises(RUNTIME.ConfigurationError) as failure:
                        RUNTIME.configure_worker_import_runtime(worker, api)
                    self.assertNotIn("DO_NOT_LEAK", str(failure.exception))

    def test_rejects_duplicate_entries_collisions_and_secret_tls_overrides(self) -> None:
        mutations = (
            lambda td: td["containerDefinitions"][0]["environment"].append({"name": "APP_ENV", "value": "qas"}),
            lambda td: td["containerDefinitions"][0]["secrets"].append({"name": "EXISTING_TOKEN", "valueFrom": secret()}),
            lambda td: td["containerDefinitions"][0]["environment"].append({"name": "EXISTING_TOKEN", "value": "collision"}),
            lambda td: td["containerDefinitions"][0]["secrets"].append({"name": "DATABASE_SSL", "valueFrom": secret()}),
            lambda td: td["containerDefinitions"][0]["secrets"].append({"name": "DATABASE_SSL_CA_FILE", "valueFrom": secret()}),
            lambda td: td["containerDefinitions"].append(copy.deepcopy(td["containerDefinitions"][0])),
            lambda td: td.update(containerDefinitions=[]),
            lambda td: td.update(family="cdr-pim-qas-api"),
        )
        for mutation in mutations:
            worker, api = definitions()
            mutation(worker)
            with self.subTest(mutation=mutation), self.assertRaises(RUNTIME.ConfigurationError):
                RUNTIME.configure_worker_import_runtime(worker, api)

    def test_rejects_environment_region_account_and_partition_crossovers(self) -> None:
        for reference in (
            secret("prd"), secret().replace(REGION, "us-west-2"),
            secret().replace(ACCOUNT, "999999999999"), secret().replace("arn:aws:", "arn:aws-cn:"),
        ):
            worker, api = definitions()
            api["containerDefinitions"][0]["secrets"][-1]["valueFrom"] = reference
            with self.subTest(reference=reference), self.assertRaises(RUNTIME.ConfigurationError):
                RUNTIME.configure_worker_import_runtime(worker, api)
        for context in ({"environment": "prd"}, {"region": "us-west-2"}, {"account_id": "999999999999"}):
            with self.subTest(context=context), self.assertRaises(RUNTIME.ConfigurationError):
                RUNTIME.configure_worker_import_runtime(*definitions(), **context)
        worker, _ = definitions()
        _, api = definitions("prd")
        with self.assertRaises(RUNTIME.ConfigurationError):
            RUNTIME.configure_worker_import_runtime(worker, api)

    def test_infers_context_from_remaining_role_image_log_and_region_sources(self) -> None:
        # A bare definition without descriptive family/TD ARN must still catch a
        # cross-region/account reference when another existing field identifies it.
        for field in ("role", "image", "logs", "environment"):
            worker, api = definitions()
            for td in (worker, api):
                for key in ("taskDefinitionArn", "taskRoleArn", "executionRoleArn"):
                    td.pop(key)
                td["family"] = "fixture"
                container = td["containerDefinitions"][0]
                container["image"] = "fixture-image"
                container.pop("logConfiguration")
            container = worker["containerDefinitions"][0]
            if field == "role":
                worker["executionRoleArn"] = "arn:aws:iam::999999999999:role/execution"
            elif field == "image":
                container["image"] = f"999999999999.dkr.ecr.{REGION}.amazonaws.com/worker:fixture"
            elif field == "logs":
                container["logConfiguration"] = {"options": {"awslogs-region": "us-west-2"}}
            else:
                container["environment"].append({"name": "AWS_REGION", "value": "us-west-2"})
            with self.subTest(field=field), self.assertRaises(RUNTIME.ConfigurationError):
                RUNTIME.configure_worker_import_runtime(worker, api)

    def test_readiness_policy_replaces_wrong_probe_and_preserves_correct_patient_probe(self) -> None:
        worker, api = definitions()
        worker["containerDefinitions"][0]["healthCheck"] = {"command": ["CMD", "true"], "startPeriod": 300}
        configured = RUNTIME.configure_worker_import_runtime(worker, api)
        self.assertEqual(configured["containerDefinitions"][0]["healthCheck"], RUNTIME.HEALTH_CHECK)
        correct = copy.deepcopy(RUNTIME.HEALTH_CHECK)
        correct.update(interval=60, timeout=10, startPeriod=120, retries=5)
        worker["containerDefinitions"][0]["healthCheck"] = correct
        self.assertEqual(RUNTIME.configure_worker_import_runtime(worker, api)["containerDefinitions"][0]["healthCheck"], correct)
        correct.update(timeout=999, interval=True, retries=1)
        actual = RUNTIME.configure_worker_import_runtime(worker, api)["containerDefinitions"][0]["healthCheck"]
        self.assertEqual((actual["interval"], actual["timeout"], actual["retries"], actual["startPeriod"]), (30, 5, 3, 120))

    @unittest.skipUnless(shutil.which("node"), "Node is needed to execute the deployed readiness command")
    def test_readiness_command_uses_worker_port_and_propagates_failure(self) -> None:
        for port, status, rejected in (("4567", 200, False), (None, 503, False), ("4567", 200, True)):
            with self.subTest(port=port, status=status, rejected=rejected):
                environment = {**os.environ, "PORT": "3001"}
                environment.pop("WORKER_PORT", None)
                if port is not None:
                    environment["WORKER_PORT"] = port
                expected = f"http://127.0.0.1:{port or '3002'}/health/ready"
                stub = f"global.fetch=async url=>{{if(url!=={json.dumps(expected)})process.exit(9);"
                stub += "throw Error('unavailable')};" if rejected else f"return {{ok:{str(status == 200).lower()}}}}};"
                result = subprocess.run(["node", "-e", stub + RUNTIME.HEALTH_SCRIPT], env=environment, capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 0 if status == 200 and not rejected else 1)
        docker = SCRIPT.parent.parent / "docker/worker.Dockerfile"
        self.assertIn(RUNTIME.HEALTH_SCRIPT, docker.read_text())
        self.assertIn("--start-period=30s", docker.read_text())

    def test_cli_atomic_plan_check_and_failures_do_not_expose_input_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            worker_path, api_path, output = (folder / name for name in ("worker.json", "api.json", "output.json"))
            worker, api = definitions()
            worker_path.write_text(json.dumps(worker))
            api_path.write_text(json.dumps(api))
            command = [sys.executable, str(SCRIPT), "--environment", "qas", "--region", REGION, "--account-id", ACCOUNT]
            first = subprocess.run([*command, str(worker_path), str(api_path), str(output)], capture_output=True, timeout=5)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual((first.stdout, first.stderr), (b"", b""))
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            planned = output.read_bytes()
            checked = subprocess.run([*command, "--check", str(output), str(api_path)], capture_output=True, timeout=5)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            unchecked = subprocess.run([*command, "--check", str(worker_path), str(api_path)], capture_output=True, timeout=5)
            self.assertNotEqual(unchecked.returncode, 0)
            worker["containerDefinitions"][0]["environment"].append({"name": "DATABASE_URL", "value": "postgres://DO_NOT_LEAK:password@example/db"})
            for invalid in (json.dumps(worker), '{"family":"DO_NOT_LEAK","family":"duplicate"}', '{"secret":"DO_NOT_LEAK" missing-comma}'):
                worker_path.write_text(invalid)
                failed = subprocess.run([*command, str(worker_path), str(api_path), str(output)], capture_output=True, timeout=5)
                self.assertNotEqual(failed.returncode, 0)
                self.assertNotIn(b"DO_NOT_LEAK", failed.stdout + failed.stderr)
                self.assertNotIn(b"postgres://", failed.stdout + failed.stderr)
                self.assertEqual(output.read_bytes(), planned)
            self.assertEqual({path.name for path in folder.iterdir()}, {"worker.json", "api.json", "output.json"})


if __name__ == "__main__":
    unittest.main()
