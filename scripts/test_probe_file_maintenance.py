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
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("probe-file-maintenance.py")
SPEC = importlib.util.spec_from_file_location("probe_file_maintenance", SCRIPT)
assert SPEC and SPEC.loader
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)
VERSION = "a" * 40
DEFINITION = "arn:aws:ecs:region:123456789012:task-definition/cdr-pim-qas-api:7"
TASK_IDS = ["1" * 32, "2" * 32]


def completed(status: str = "completed", **overrides: object) -> dict:
    return {
        "message": "File maintenance completed", "status": status,
        "pages": 2, "observed": 1, "protected": 1, "deleted": 0, "absent": 0,
        "changed": 0, "failed": 0, "reclaimedBytes": 0, "failureCodes": {}, **overrides,
    }


def fixtures() -> dict:
    return {
        "describe-services": {"services": [{"taskDefinition": DEFINITION}]},
        "describe-task-definition": {"taskDefinition": {"containerDefinitions": [{
            "name": "api", "environment": [{"name": "APP_VERSION", "value": VERSION},
                                               {"name": "LEGACY_SECRET", "value": "never-print-legacy-value"}],
            "logConfiguration": {"logDriver": "awslogs", "options": {
                "awslogs-group": "/fixture/api", "awslogs-stream-prefix": "api",
            }},
        }]}},
        "list-tasks": {"taskArns": [f"arn:aws:ecs:region:123456789012:task/cdr-pim-qas/{task}" for task in TASK_IDS]},
        "describe-tasks": {"tasks": [{
            "taskArn": f"arn:aws:ecs:region:123456789012:task/cdr-pim-qas/{task}",
            "group": "service:cdr-pim-qas-api", "lastStatus": "RUNNING", "taskDefinitionArn": DEFINITION,
        } for task in TASK_IDS]},
        "get-log-events": {"events": [{"message": json.dumps(completed())}], "nextForwardToken": "next"},
    }


class FakeClient:
    def __init__(self) -> None:
        self.responses = fixtures()
        self.calls: list[tuple] = []
        self.logs = None

    def read(self, service: str, operation: str, *arguments: str) -> dict:
        self.calls.append((service, operation, *arguments))
        if operation == "get-log-events" and self.logs:
            return self.logs(arguments)
        response = self.responses[operation]
        if isinstance(response, Exception):
            raise response
        return copy.deepcopy(response)


class ProbeFileMaintenanceTest(unittest.TestCase):
    def run_probe(self, client: FakeClient) -> tuple[dict, list]:
        sleeps = []
        result = PROBE.probe(client, "qas", VERSION, sleep=sleeps.append)
        return result, sleeps

    def test_parser_accepts_only_exact_cleanup_messages_and_allowlisted_fields(self) -> None:
        record = completed(token="never-print-token", stack="never-print-stack", request={"path": "never-print-path"})
        safe = PROBE.cleanup_record(json.dumps(record))
        self.assertEqual(safe["status"], "completed")
        self.assertEqual(set(safe), {"status", "failureCodes", *PROBE.SUMMARY_FIELDS})
        self.assertNotIn("never-print", json.dumps(safe))
        for raw in [
            "request File maintenance completed", "not json", "[]", None,
            json.dumps({**record, "message": "HTTP File maintenance completed"}),
            json.dumps({**record, "message": "File maintenance completed request/path"}),
            json.dumps({**record, "status": {"secret": "never-print"}}),
            json.dumps({**record, "failed": False}),
            json.dumps({**record, "pages": -1}),
            json.dumps({**record, "deleted": "0"}),
        ]:
            with self.subTest(raw=raw):
                self.assertIsNone(PROBE.cleanup_record(raw))

    def test_parser_sanitizes_vendor_errors_and_failure_codes(self) -> None:
        for code in PROBE.ERROR_CODES:
            safe = PROBE.cleanup_record(json.dumps({"message": PROBE.UNAVAILABLE_MESSAGE, "code": code,
                                                   "dependency": "s3:maintenance-inventory", "stack": "never-print"}))
            self.assertEqual(safe, {"status": "failed", "code": code, "dependency": "s3:maintenance-inventory"})
        safe = PROBE.cleanup_record(json.dumps({"message": PROBE.UNAVAILABLE_MESSAGE, "code": {"secret": "never-print"},
                                               "dependency": "s3://never-print-private-key"}))
        self.assertEqual(safe, {"status": "failed", "code": "UNAVAILABLE", "dependency": "file-maintenance"})
        safe = PROBE.cleanup_record(json.dumps(completed(failed=2, failureCodes={
            "ACCESS_DENIED": 2, "never-print": 1, "TIMEOUT": "never-print", "UNAVAILABLE": False,
        })))
        self.assertEqual(safe["failureCodes"], {"ACCESS_DENIED": 2})

    def test_verifies_one_completed_current_replica_while_another_is_busy(self) -> None:
        client = FakeClient()
        client.logs = lambda args: {"events": [{"message": json.dumps(completed(
            "busy" if TASK_IDS[0] in args[3] else "completed"
        ))}]}
        result, sleeps = self.run_probe(client)
        self.assertEqual((result["status"], result["tasks"]), ("verified", 2))
        self.assertEqual(sleeps, [])
        self.assertEqual({record["status"] for record in result["records"]}, {"busy", "completed"})
        list_call = next(call for call in client.calls if call[1] == "list-tasks")
        self.assertIn("--no-paginate", list_call)
        self.assertEqual(list_call[list_call.index("--max-results") + 1], "10")
        for call in client.calls:
            self.assertIn(call[:2], PROBE.READ_OPERATIONS)
            if call[0] == "logs":
                self.assertIn("--start-from-head", call)
                self.assertIn("--no-paginate", call)
                self.assertEqual(call[call.index("--limit") + 1], "1000")

    def test_skips_old_task_definitions_and_never_verifies_logs_from_them(self) -> None:
        client = FakeClient()
        client.responses["describe-tasks"]["tasks"][0]["taskDefinitionArn"] = "older-definition"
        result, _ = self.run_probe(client)
        self.assertEqual((result["status"], result["tasks"]), ("verified", 1))
        self.assertTrue(all(TASK_IDS[0] not in argument for call in client.calls if call[0] == "logs" for argument in call))
        client.responses["describe-tasks"]["tasks"][1]["taskDefinitionArn"] = "older-definition"
        client.calls.clear()
        result, _ = self.run_probe(client)
        self.assertEqual(result["reason"], "CURRENT_TASKS_MISSING")
        self.assertFalse(any(call[0] == "logs" for call in client.calls))

    def test_rejects_stale_app_version_before_reading_cloudwatch(self) -> None:
        client = FakeClient()
        client.responses["describe-task-definition"]["taskDefinition"]["containerDefinitions"][0]["environment"][0]["value"] = "b" * 40
        result, _ = self.run_probe(client)
        self.assertEqual(result["reason"], "DEPLOYMENT_VERSION_MISMATCH")
        self.assertFalse(any(call[0] == "logs" for call in client.calls))

    def test_retries_delayed_logs_with_bounded_forward_pagination(self) -> None:
        client = FakeClient()
        calls = 0
        def logs(arguments: tuple) -> dict:
            nonlocal calls
            calls += 1
            if calls <= 2:
                return {"events": [{"message": '{"message":"request never-print"}'}], "nextForwardToken": "first"}
            self.assertEqual(arguments[-2:], ("--next-token", "first"))
            return {"events": [{"message": json.dumps(completed())}]}
        client.logs = logs
        result, sleeps = self.run_probe(client)
        self.assertEqual(result["status"], "verified")
        self.assertEqual(sleeps, [10])

    def test_busy_or_missing_logs_are_unavailable_after_six_attempts(self) -> None:
        for events, reason in [([], "CLEANUP_LOG_MISSING"), ([{"message": json.dumps(completed("busy"))}], "BUSY_WITHOUT_COMPLETION")]:
            with self.subTest(reason=reason):
                client = FakeClient()
                client.responses["get-log-events"] = {"events": events}
                result, sleeps = self.run_probe(client)
                self.assertEqual((result["status"], result["reason"]), ("unavailable", reason))
                self.assertEqual(sleeps, [10] * 5)
                self.assertEqual(sum(call[0] == "logs" for call in client.calls), 12)

    def test_delayed_log_streams_retry_and_do_not_leave_a_stale_missing_reason(self) -> None:
        client = FakeClient()
        reads = 0
        def logs(_arguments: tuple) -> dict:
            nonlocal reads
            reads += 1
            if reads <= 2:
                raise PROBE.ReadUnavailable("NOT_FOUND")
            return {"events": []}
        client.logs = logs
        result, sleeps = self.run_probe(client)
        self.assertEqual(result["reason"], "CLEANUP_LOG_MISSING")
        self.assertEqual(len(sleeps), 5)
        client.responses["get-log-events"] = PROBE.ReadUnavailable("NOT_FOUND")
        client.logs = None
        result, _ = self.run_probe(client)
        self.assertEqual(result["reason"], "CLOUDWATCH_NOT_FOUND")

    def test_global_deadline_bounds_calls_even_with_more_replicas(self) -> None:
        client = FakeClient()
        client.responses["get-log-events"] = {"events": []}
        ticks = iter([0, 0, 181, 181])
        sleeps = []
        result = PROBE.probe(client, "qas", VERSION, sleep=sleeps.append, monotonic=lambda: next(ticks))
        self.assertEqual(result["reason"], "CLOUDWATCH_TIMEOUT")
        self.assertEqual(sum(call[0] == "logs" for call in client.calls), 1)
        self.assertEqual(sleeps, [])

    def test_aws_reader_allows_only_reads_and_never_exposes_vendor_errors(self) -> None:
        client = PROBE.AwsReadClient(PROBE.time.monotonic() + 30)
        with patch.object(PROBE.subprocess, "run") as run:
            with self.assertRaises(PROBE.ReadUnavailable):
                client.read("ecs", "run-task")
            run.assert_not_called()
        for error, code in [
            (subprocess.CompletedProcess([], 1, "", "An error occurred (AccessDeniedException) when calling: never-print-private-bucket"), "ACCESS_DENIED"),
            (subprocess.CompletedProcess([], 1, "", "An error occurred (ResourceNotFoundException) when calling: never-print-stream"), "NOT_FOUND"),
            (subprocess.CompletedProcess([], 1, "", "Read timeout on endpoint: never-print-endpoint"), "TIMEOUT"),
            (subprocess.CompletedProcess([], 0, "never-print-invalid-json", ""), "UNAVAILABLE"),
        ]:
            with self.subTest(code=code), patch.object(PROBE.subprocess, "run", return_value=error):
                with self.assertRaises(PROBE.ReadUnavailable) as caught:
                    client.read("logs", "get-log-events")
                self.assertEqual(str(caught.exception), code)
        with patch.object(PROBE.subprocess, "run", side_effect=subprocess.TimeoutExpired("never-print-command", 15)):
            with self.assertRaises(PROBE.ReadUnavailable) as caught:
                client.read("ecs", "describe-services")
            self.assertEqual(str(caught.exception), "TIMEOUT")

    def test_job_errors_are_failed_and_distinct_from_cloudwatch_read_permissions(self) -> None:
        for code in PROBE.ERROR_CODES:
            with self.subTest(code=code):
                client = FakeClient()
                client.responses["get-log-events"] = {"events": [{"message": json.dumps({
                    "message": PROBE.UNAVAILABLE_MESSAGE, "code": code, "dependency": "s3:maintenance-inventory"
                })}]}
                result, _ = self.run_probe(client)
                self.assertEqual(result["status"], "failed")
                self.assertEqual(result["records"][0]["code"], code)
        client = FakeClient()
        client.responses["get-log-events"] = PROBE.ReadUnavailable("ACCESS_DENIED")
        result, _ = self.run_probe(client)
        self.assertEqual((result["status"], result["reason"]), ("unavailable", "CLOUDWATCH_ACCESS_DENIED"))
        client.responses["describe-services"] = PROBE.ReadUnavailable("ACCESS_DENIED")
        result, _ = self.run_probe(client)
        self.assertEqual(result["reason"], "ECS_ACCESS_DENIED")

    def test_partial_purge_failures_cannot_be_hidden_by_another_healthy_replica(self) -> None:
        client = FakeClient()
        client.logs = lambda args: {"events": [{"message": json.dumps(completed(
            failed=1 if TASK_IDS[0] in args[3] else 0,
            failureCodes={"ACCESS_DENIED": 1} if TASK_IDS[0] in args[3] else {},
        ))}]}
        result, _ = self.run_probe(client)
        self.assertEqual(result["status"], "failed")

    def test_cli_uses_mock_aws_read_operations_and_emits_only_filtered_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            aws = folder / "aws"
            responder = folder / "respond.py"
            data, calls, output, summary = [folder / name for name in ("responses.json", "calls.jsonl", "output", "summary")]
            response = fixtures()
            response["get-log-events"]["events"].insert(0, {"message": json.dumps({
                "message": "HTTP request", "token": "never-print-token", "path": "never-print-private-path",
            })})
            data.write_text(json.dumps(response))
            responder.write_text(
                "import json, os, sys\n"
                "from pathlib import Path\n"
                "args = sys.argv[1:]\n"
                "with Path(os.environ['MOCK_CALLS']).open('a') as file: file.write(json.dumps(args) + '\\n')\n"
                "responses = json.loads(Path(os.environ['MOCK_DATA']).read_text())\n"
                "if args[:2] not in [['ecs','describe-services'],['ecs','describe-task-definition'],['ecs','list-tasks'],['ecs','describe-tasks'],['logs','get-log-events']]: sys.exit(9)\n"
                "print(json.dumps(responses[args[1]]))\n"
            )
            aws.write_text('#!/usr/bin/env bash\nset -euo pipefail\nexec "$MOCK_PYTHON" "$MOCK_RESPONDER" "$@"\n')
            aws.chmod(0o700)
            environment = {**os.environ, "PATH": f"{folder}{os.pathsep}{os.environ['PATH']}",
                           "MOCK_PYTHON": sys.executable, "MOCK_RESPONDER": str(responder),
                           "MOCK_DATA": str(data), "MOCK_CALLS": str(calls),
                           "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}
            result = subprocess.run([sys.executable, str(SCRIPT), "--environment", "qas", "--version", VERSION],
                                    capture_output=True, text=True, check=False, env=environment, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("verified (COMPLETED)", result.stdout)
            self.assertEqual(result.stderr, "")
            self.assertEqual(output.read_text(), "status=verified\nreason=COMPLETED\n")
            self.assertIn("File cleanup operational evidence (qas)", summary.read_text())
            self.assertNotIn("never-print", result.stdout + result.stderr + output.read_text() + summary.read_text())
            for line in calls.read_text().splitlines():
                call = json.loads(line)
                self.assertIn(tuple(call[:2]), PROBE.READ_OPERATIONS)
                self.assertIn("--no-cli-pager", call)
                self.assertEqual(call[call.index("--cli-read-timeout") + 1], "8")


if __name__ == "__main__":
    unittest.main()
