#!/usr/bin/env python3
"""Verify the requested ECS revision is actually serving before promoting its producers.

Only four read-only ECS operations are allowed. Raw task definitions, environments,
AWS errors and pagination tokens never leave memory or appear in command output.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any, Protocol

READ_OPERATIONS = frozenset({
    'describe-services', 'describe-task-definition', 'list-tasks', 'describe-tasks',
})


class VerificationError(Exception):
    """A fixed diagnostic safe to print without AWS response data."""


class ReadClient(Protocol):
    def read(self, operation: str, *arguments: str) -> dict[str, Any]: ...


class AwsReadClient:
    def read(self, operation: str, *arguments: str) -> dict[str, Any]:
        if operation not in READ_OPERATIONS:
            raise VerificationError('operation is outside the read-only allowlist')
        try:
            result = subprocess.run(
                ['aws', 'ecs', operation, *arguments, '--output', 'json', '--no-cli-pager',
                 '--cli-connect-timeout', '5', '--cli-read-timeout', '20'],
                capture_output=True, text=True, check=False, timeout=60,
                env={**os.environ, 'AWS_PAGER': '', 'AWS_MAX_ATTEMPTS': '2'},
            )
        except (OSError, subprocess.TimeoutExpired):
            raise VerificationError('ECS read is unavailable') from None
        if result.returncode:
            raise VerificationError('ECS read failed')
        try:
            document = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise VerificationError('ECS read returned invalid JSON') from None
        if not isinstance(document, dict):
            raise VerificationError('ECS read returned an invalid document')
        return document


def validate_request(environment: str, app: str, task_definition: str, image: str, version: str) -> None:
    if environment not in {'qas', 'prd'} or app not in {'worker', 'api', 'web'}:
        raise VerificationError('unknown environment or application')
    if not re.fullmatch(r'[0-9a-f]{40}', version):
        raise VerificationError('version must be a full lowercase commit SHA')
    match = re.fullmatch(
        r'arn:aws(?:-[a-z]+)*:ecs:([a-z0-9-]+):(\d{12}):task-definition/'
        + re.escape(f'cdr-pim-{environment}-{app}') + r':[1-9][0-9]*', task_definition,
    )
    if not match:
        raise VerificationError('task definition must identify the requested environment and application')
    registry = re.escape(f'{match[2]}.dkr.ecr.{match[1]}.amazonaws.com')
    if not re.fullmatch(registry + r'(?:\.cn)?/cdr-pim-' + app + r'@sha256:[0-9a-f]{64}', image):
        raise VerificationError('image must be an immutable digest for the requested account and application')


def check_service(document: dict[str, Any], task_definition: str, service_name: str) -> int:
    services = document.get('services')
    if document.get('failures') or not isinstance(services, list) or len(services) != 1:
        raise VerificationError('service description is incomplete')
    service = services[0]
    if not isinstance(service, dict) or service.get('serviceName') != service_name or service.get('status') != 'ACTIVE':
        raise VerificationError('service identity or state does not match')
    if service.get('taskDefinition') != task_definition:
        raise VerificationError('service rolled back or does not use the requested revision')
    desired = service.get('desiredCount')
    if not isinstance(desired, int) or isinstance(desired, bool) or desired <= 0:
        raise VerificationError('service must have a positive desired count')
    if service.get('runningCount') != desired or service.get('pendingCount') != 0:
        raise VerificationError('service has not reached its desired running count')
    deployments = service.get('deployments')
    if not isinstance(deployments, list) or len(deployments) != 1 or not isinstance(deployments[0], dict):
        raise VerificationError('service must have exactly one completed deployment')
    primary = deployments[0]
    if primary.get('status') != 'PRIMARY' or primary.get('rolloutState') != 'COMPLETED' or primary.get('taskDefinition') != task_definition:
        raise VerificationError('requested deployment has not completed')
    return desired


def check_definition(document: dict[str, Any], task_definition: str, image: str, version: str, app: str) -> tuple[str, bool]:
    definition = document.get('taskDefinition')
    if not isinstance(definition, dict) or definition.get('taskDefinitionArn') != task_definition:
        raise VerificationError('task definition response does not match the requested revision')
    containers = definition.get('containerDefinitions')
    if not isinstance(containers, list) or not containers or not isinstance(containers[0], dict):
        raise VerificationError('main application container is missing')
    main = containers[0]
    name = main.get('name')
    if not isinstance(name, str) or not name or main.get('image') != image:
        raise VerificationError('main application container or image does not match')
    environment = main.get('environment', [])
    secrets = main.get('secrets', [])
    if not isinstance(environment, list) or not all(isinstance(item, dict) for item in environment) or not isinstance(secrets, list) or not all(isinstance(item, dict) for item in secrets):
        raise VerificationError('application version configuration is invalid')
    versions = [item.get('value') for item in environment if item.get('name') == 'APP_VERSION']
    if versions != [version] or any(item.get('name') == 'APP_VERSION' for item in secrets):
        raise VerificationError('application must have exactly one matching APP_VERSION')
    require_health = app == 'worker' or 'healthCheck' in main
    if require_health:
        health = main.get('healthCheck')
        command = health.get('command') if isinstance(health, dict) else None
        if not isinstance(command, list) or not command or not all(isinstance(part, str) and part for part in command):
            raise VerificationError('main container requires an explicit task-definition health check')
    return name, require_health


def running_task_arns(client: ReadClient, cluster: str, service_name: str, desired: int) -> list[str]:
    tasks: list[str] = []
    tokens: set[str] = set()
    token: str | None = None
    while True:
        # Match CLI and service page sizes; use CLI tokens rather than raw API tokens.
        arguments = ['--cluster', cluster, '--service-name', service_name, '--desired-status', 'RUNNING',
                     '--page-size', '100', '--max-items', '100']
        if token:
            arguments += ['--starting-token', token]
        page = client.read('list-tasks', *arguments)
        page_tasks = page.get('taskArns')
        if not isinstance(page_tasks, list) or not all(isinstance(arn, str) and arn.startswith('arn:') for arn in page_tasks):
            raise VerificationError('running task listing is invalid')
        tasks += page_tasks
        if len(tasks) != len(set(tasks)) or len(tasks) > desired:
            raise VerificationError('running task listing is inconsistent with the stable service')
        if page.get('nextToken'):
            raise VerificationError('running task listing did not use CLI pagination')
        token = page.get('NextToken')
        if not token:
            break
        if not isinstance(token, str) or token in tokens:
            raise VerificationError('running task pagination is invalid')
        tokens.add(token)
    if len(tasks) != desired:
        raise VerificationError('listed running task count does not match the desired count')
    return tasks


def check_tasks(document: dict[str, Any], requested: list[str], task_definition: str, image: str,
                main_name: str, require_health: bool, service_name: str) -> None:
    tasks = document.get('tasks')
    if document.get('failures') or not isinstance(tasks, list) or not all(isinstance(task, dict) for task in tasks):
        raise VerificationError('running task description is incomplete')
    if not all(isinstance(task.get('taskArn'), str) for task in tasks) or len(tasks) != len(requested) or {task.get('taskArn') for task in tasks} != set(requested):
        raise VerificationError('running task description does not cover every listed task')
    for task in tasks:
        if task.get('taskDefinitionArn') != task_definition:
            raise VerificationError('a running task still uses another revision')
        if task.get('lastStatus') != 'RUNNING' or task.get('desiredStatus') != 'RUNNING' or task.get('group') != f'service:{service_name}':
            raise VerificationError('a listed task is not running in the requested service')
        containers = task.get('containers')
        if not isinstance(containers, list) or not all(isinstance(container, dict) for container in containers):
            raise VerificationError('running task containers are invalid')
        main = [container for container in containers if container.get('name') == main_name]
        if len(main) != 1 or main[0].get('lastStatus') != 'RUNNING' or main[0].get('image') != image:
            raise VerificationError('a running main container or immutable image does not match')
        # imageDigest may be an OCI child manifest; compare the configured immutable URL.
        if require_health and (task.get('healthStatus') != 'HEALTHY' or main[0].get('healthStatus') != 'HEALTHY'):
            raise VerificationError('a running task or main container is not healthy')


def verify_promotion(client: ReadClient, environment: str, app: str, task_definition: str, image: str, version: str) -> int:
    validate_request(environment, app, task_definition, image, version)
    cluster = f'cdr-pim-{environment}'
    service_name = f'{cluster}-{app}'
    desired = check_service(client.read('describe-services', '--cluster', cluster, '--services', service_name),
                            task_definition, service_name)
    main_name, require_health = check_definition(client.read('describe-task-definition', '--task-definition', task_definition),
                                                task_definition, image, version, app)
    tasks = running_task_arns(client, cluster, service_name, desired)
    for start in range(0, len(tasks), 100):
        batch = tasks[start:start + 100]
        check_tasks(client.read('describe-tasks', '--cluster', cluster, '--tasks', *batch), batch,
                    task_definition, image, main_name, require_health, service_name)
    # Catch a service update or rollback that occurred during the task reads.
    final_desired = check_service(client.read('describe-services', '--cluster', cluster, '--services', service_name),
                                  task_definition, service_name)
    if final_desired != desired:
        raise VerificationError('desired task count changed during verification')
    return desired


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', required=True, choices=['qas', 'prd'])
    parser.add_argument('--app', required=True, choices=['worker', 'api', 'web'])
    parser.add_argument('--task-definition', required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--version', required=True)
    args = parser.parse_args(argv)
    try:
        count = verify_promotion(AwsReadClient(), args.environment, args.app, args.task_definition, args.image, args.version)
    except VerificationError as error:
        print(f'ECS promotion verification failed: {error}', file=sys.stderr)
        return 1
    except (TypeError, ValueError, KeyError, AttributeError):
        print('ECS promotion verification failed: invalid ECS response metadata', file=sys.stderr)
        return 1
    print(f'OK {args.environment} {args.app} version={args.version} running={count}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
