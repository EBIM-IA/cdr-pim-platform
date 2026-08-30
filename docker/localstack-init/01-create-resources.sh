#!/bin/bash
# Provisions the local AWS resources the platform expects.
#
# This mirrors — by hand and in miniature — what Terraform creates in QAS/PRD. It is
# intentionally NOT generated from the Terraform code: keeping them separate means the
# local file stays trivial, and the real definition (with DLQ redrive, KMS, alarms) stays
# in `cdr-pim-infrastructure` where it belongs.
set -e

awslocal sqs create-queue --queue-name cdr-pim-local-jobs-dlq

awslocal sqs create-queue \
  --queue-name cdr-pim-local-jobs \
  --attributes "$(cat <<JSON
{
  "VisibilityTimeout": "120",
  "MessageRetentionPeriod": "345600",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:cdr-pim-local-jobs-dlq\",\"maxReceiveCount\":\"5\"}"
}
JSON
)"

awslocal s3api create-bucket --bucket cdr-pim-local-assets
awslocal s3api put-bucket-versioning \
  --bucket cdr-pim-local-assets \
  --versioning-configuration Status=Enabled

echo "LocalStack resources ready: SQS cdr-pim-local-jobs (+DLQ), S3 cdr-pim-local-assets"
