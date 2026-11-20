from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('verify-ecs-promotion.py')
SPEC = importlib.util.spec_from_file_location('verify_ecs_promotion', SCRIPT)
assert SPEC and SPEC.loader
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
VERSION = 'a' * 40
REGISTRY = '123456789012.dkr.ecr.us-east-1.amazonaws.com'


def fixtures(app: str = 'worker', desired: int = 2) -> dict:
    service_name = f'cdr-pim-qas-{app}'
    definition = f'arn:aws:ecs:us-east-1:123456789012:task-definition/{service_name}:7'
    image = f'{REGISTRY}/cdr-pim-{app}@sha256:' + 'b' * 64
    main = {
        'name': app, 'image': image,
        'environment': [{'name': 'APP_VERSION', 'value': VERSION},
                        {'name': 'LEGACY_PRIVATE_VALUE', 'value': 'never-print-private-value'}],
        'secrets': [{'name': 'DATABASE_URL', 'valueFrom': 'never-print-secret-reference'}],
    }
    if app == 'worker':
        main['healthCheck'] = {'command': ['CMD', 'node', 'health.js']}
    return {
        'expected': {'environment': 'qas', 'app': app, 'task_definition': definition,
                     'image': image, 'version': VERSION},
        'service': {'services': [{
            'serviceName': service_name, 'status': 'ACTIVE', 'taskDefinition': definition,
            'desiredCount': desired, 'runningCount': desired, 'pendingCount': 0,
            'deployments': [{'status': 'PRIMARY', 'rolloutState': 'COMPLETED', 'taskDefinition': definition}],
        }]},
        'definition': {'taskDefinition': {'taskDefinitionArn': definition, 'containerDefinitions': [main]}},
        'tasks': [{
            'taskArn': f'arn:aws:ecs:us-east-1:123456789012:task/cdr-pim-qas/{index:032x}',
            'taskDefinitionArn': definition, 'group': f'service:{service_name}',
            'desiredStatus': 'RUNNING', 'lastStatus': 'RUNNING',
            'healthStatus': 'HEALTHY' if app == 'worker' else 'UNKNOWN',
            'containers': [{'name': app, 'lastStatus': 'RUNNING', 'image': image,
                            'imageDigest': 'sha256:' + 'c' * 64,
                            'healthStatus': 'HEALTHY' if app == 'worker' else 'UNKNOWN'}],
        } for index in range(desired)],
    }


class FakeClient:
    def __init__(self, data: dict | None = None) -> None:
        self.data = data or fixtures()
        self.calls: list[tuple] = []
        self.final_service: dict | None = None
        self.service_reads = 0

    def read(self, operation: str, *arguments: str) -> dict:
        self.calls.append((operation, *arguments))
        if operation == 'describe-services':
            self.service_reads += 1
            return copy.deepcopy(self.final_service if self.service_reads > 1 and self.final_service else self.data['service'])
        if operation == 'describe-task-definition':
            return copy.deepcopy(self.data['definition'])
        if operation == 'list-tasks':
            offset = int(arguments[arguments.index('--starting-token') + 1]) if '--starting-token' in arguments else 0
            tasks = self.data['tasks'][offset:offset + 100]
            result = {'taskArns': [task['taskArn'] for task in tasks]}
            if len(self.data['tasks']) > offset + 100:
                result['NextToken'] = str(offset + 100)
            return result
        if operation == 'describe-tasks':
            requested = arguments[arguments.index('--tasks') + 1:]
            return {'tasks': copy.deepcopy([task for task in self.data['tasks'] if task['taskArn'] in requested])}
        raise AssertionError('Unexpected operation')


class VerifyEcsPromotionTest(unittest.TestCase):
    def verify(self, data: dict, client: FakeClient | None = None) -> int:
        return VERIFY.verify_promotion(client or FakeClient(data), **data['expected'])

    def rejects(self, data: dict, message: str) -> None:
        with self.assertRaisesRegex(VERIFY.VerificationError, message):
            self.verify(data)

    def test_good_worker_checks_actual_tasks_and_accepts_oci_child_digest(self) -> None:
        data = fixtures()
        client = FakeClient(data)
        self.assertEqual(self.verify(data, client), 2)
        self.assertEqual(client.service_reads, 2)
        self.assertEqual({call[0] for call in client.calls}, VERIFY.READ_OPERATIONS)
        listing = next(call for call in client.calls if call[0] == 'list-tasks')
        self.assertEqual(listing[listing.index('--desired-status') + 1], 'RUNNING')
        self.assertEqual(listing[listing.index('--service-name') + 1], 'cdr-pim-qas-worker')

    def test_accepts_the_single_replica_shape_used_in_qas(self) -> None:
        self.assertEqual(self.verify(fixtures(desired=1)), 1)

    def test_accepts_prd_only_when_all_fixture_resources_are_prd(self) -> None:
        data = json.loads(json.dumps(fixtures(desired=1)).replace('qas', 'prd'))
        self.assertEqual(self.verify(data), 1)

    def test_rejects_service_rollback_even_when_stable(self) -> None:
        data = fixtures()
        data['service']['services'][0]['taskDefinition'] = data['expected']['task_definition'].replace(':7', ':6')
        self.rejects(data, 'rolled back')

    def test_rejects_a_still_running_old_task(self) -> None:
        data = fixtures()
        data['tasks'][1]['taskDefinitionArn'] = data['expected']['task_definition'].replace(':7', ':6')
        self.rejects(data, 'another revision')

    def test_rejects_scale_to_zero(self) -> None:
        self.rejects(fixtures(desired=0), 'positive desired count')

    def test_rejects_pending_or_missing_replicas(self) -> None:
        for key, value in [('pendingCount', 1), ('runningCount', 1)]:
            with self.subTest(key=key):
                data = fixtures()
                data['service']['services'][0][key] = value
                self.rejects(data, 'desired running count')

    def test_rejects_multiple_or_incomplete_deployments(self) -> None:
        for state in ['IN_PROGRESS', 'FAILED']:
            with self.subTest(state=state):
                data = fixtures()
                data['service']['services'][0]['deployments'][0]['rolloutState'] = state
                self.rejects(data, 'has not completed')
        data = fixtures()
        data['service']['services'][0]['deployments'] *= 2
        self.rejects(data, 'exactly one')

    def test_rejects_digest_mismatch_in_definition_and_running_container(self) -> None:
        for target in ['definition', 'task']:
            with self.subTest(target=target):
                data = fixtures()
                main = data['definition']['taskDefinition']['containerDefinitions'][0] if target == 'definition' else data['tasks'][0]['containers'][0]
                main['image'] = f'{REGISTRY}/cdr-pim-worker@sha256:' + 'd' * 64
                self.rejects(data, 'image does not match')

    def test_rejects_wrong_duplicate_or_secret_overridden_app_version(self) -> None:
        for mode in ['wrong', 'duplicate', 'secret']:
            with self.subTest(mode=mode):
                data = fixtures()
                main = data['definition']['taskDefinition']['containerDefinitions'][0]
                if mode == 'wrong':
                    main['environment'][0]['value'] = 'e' * 40
                elif mode == 'duplicate':
                    main['environment'].append({'name': 'APP_VERSION', 'value': VERSION})
                else:
                    main['secrets'].append({'name': 'APP_VERSION', 'valueFrom': 'private-reference'})
                self.rejects(data, 'exactly one matching APP_VERSION')

    def test_worker_requires_explicit_task_definition_health_check(self) -> None:
        data = fixtures()
        del data['definition']['taskDefinition']['containerDefinitions'][0]['healthCheck']
        self.rejects(data, 'explicit task-definition health check')

    def test_worker_requires_healthy_task_and_main_container(self) -> None:
        for target in ['task', 'container']:
            for state in ['UNKNOWN', 'UNHEALTHY']:
                with self.subTest(target=target, state=state):
                    data = fixtures()
                    subject = data['tasks'][0] if target == 'task' else data['tasks'][0]['containers'][0]
                    subject['healthStatus'] = state
                    self.rejects(data, 'not healthy')

    def test_api_and_web_can_use_alb_health_without_a_main_container_check(self) -> None:
        for app in ['api', 'web']:
            with self.subTest(app=app):
                self.assertEqual(self.verify(fixtures(app)), 2)

    def test_api_and_web_require_health_when_the_main_container_defines_a_check(self) -> None:
        for app in ['api', 'web']:
            with self.subTest(app=app):
                data = fixtures(app)
                data['definition']['taskDefinition']['containerDefinitions'][0]['healthCheck'] = {'command': ['CMD', 'true']}
                self.rejects(data, 'not healthy')

    def test_lists_all_pages_and_describes_batches_of_at_most_100(self) -> None:
        data = fixtures(desired=103)
        client = FakeClient(data)
        self.assertEqual(self.verify(data, client), 103)
        listings = [call for call in client.calls if call[0] == 'list-tasks']
        self.assertEqual(len(listings), 2)
        self.assertIn('--starting-token', listings[1])
        batches = [call for call in client.calls if call[0] == 'describe-tasks']
        self.assertEqual([len(call) - call.index('--tasks') - 1 for call in batches], [100, 3])

    def test_rejects_missing_or_extra_listed_tasks(self) -> None:
        for count in [1, 3]:
            with self.subTest(count=count):
                data = fixtures(desired=count)
                data['service'] = fixtures(desired=2)['service']
                self.rejects(data, 'task (count|listing)')

    def test_rechecks_service_after_reading_tasks(self) -> None:
        data = fixtures()
        client = FakeClient(data)
        client.final_service = copy.deepcopy(data['service'])
        client.final_service['services'][0]['taskDefinition'] = data['expected']['task_definition'].replace(':7', ':6')
        with self.assertRaisesRegex(VERIFY.VerificationError, 'rolled back'):
            self.verify(data, client)

    def test_rejects_missing_described_tasks_instead_of_accepting_partial_evidence(self) -> None:
        data = fixtures()
        with self.assertRaisesRegex(VERIFY.VerificationError, 'every listed task'):
            VERIFY.check_tasks({'tasks': data['tasks'][:1]}, [item['taskArn'] for item in data['tasks']],
                               data['expected']['task_definition'], data['expected']['image'],
                               'worker', True, 'cdr-pim-qas-worker')

    def test_rejects_duplicate_listed_tasks(self) -> None:
        data = fixtures()
        data['tasks'][1]['taskArn'] = data['tasks'][0]['taskArn']
        self.rejects(data, 'listing is inconsistent')

    def test_rejects_cross_environment_definition_or_mutable_image_before_aws_reads(self) -> None:
        for field, value in [('environment', 'prd'), ('image', f'{REGISTRY}/cdr-pim-worker:latest'), ('version', 'short-sha')]:
            with self.subTest(field=field):
                data = fixtures()
                data['expected'][field] = value
                client = FakeClient(data)
                with self.assertRaises(VERIFY.VerificationError):
                    self.verify(data, client)
                self.assertEqual(client.calls, [])

    def test_aws_client_refuses_mutations_and_never_emits_vendor_errors(self) -> None:
        client = VERIFY.AwsReadClient()
        with patch.object(VERIFY.subprocess, 'run') as run:
            with self.assertRaisesRegex(VERIFY.VerificationError, 'read-only allowlist'):
                client.read('update-service')
            run.assert_not_called()
        with patch.object(VERIFY.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'never-print-private-value')):
            with self.assertRaisesRegex(VERIFY.VerificationError, '^ECS read failed$'):
                client.read('describe-services')

    def test_cli_prints_only_safe_metadata(self) -> None:
        data = fixtures()
        arguments = ['--environment', 'qas', '--app', 'worker', '--task-definition', data['expected']['task_definition'],
                     '--image', data['expected']['image'], '--version', VERSION]
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(VERIFY, 'AwsReadClient', return_value=FakeClient(data)), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertEqual(VERIFY.main(arguments), 0)
        self.assertEqual(stderr.getvalue(), '')
        self.assertEqual(stdout.getvalue(), f'OK qas worker version={VERSION} running=2\n')
        data['definition']['taskDefinition']['containerDefinitions'][0]['environment'][0]['value'] = 'never-print-private-value'
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(VERIFY, 'AwsReadClient', return_value=FakeClient(data)), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertEqual(VERIFY.main(arguments), 1)
        self.assertNotIn('never-print', stdout.getvalue() + stderr.getvalue())
        self.assertNotIn('arn:', stderr.getvalue())


if __name__ == '__main__':
    unittest.main()
