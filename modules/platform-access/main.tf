# Least-privilege IAM user for the raybags.com FastAPI broker.
#
# The platform (not end users) holds these credentials and uses them to:
#   - presign bounded PUT uploads into the VOD raw bucket (token-gated)
#   - read MediaConvert job status from the VOD DynamoDB jobs table
#   - read the audio admin API key from SSM (to broker admin track CRUD)
#   - presign audio uploads/downloads against the audio bucket
#   - poll telemetry queue/DLQ depth and read aggregated metrics
# Wildcards are not used; every statement is scoped to module outputs.

resource "aws_iam_user" "platform" {
  name = "${var.name_prefix}-broker"
}

resource "aws_iam_access_key" "platform" {
  user = aws_iam_user.platform.name
}

data "aws_iam_policy_document" "platform" {
  dynamic "statement" {
    for_each = var.vod_raw_bucket_arn != null ? [var.vod_raw_bucket_arn] : []
    content {
      sid       = "PresignVodRawUploads"
      effect    = "Allow"
      actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      resources = ["${statement.value}/tryout/*"]
    }
  }

  dynamic "statement" {
    for_each = var.vod_jobs_table_arn != null ? [var.vod_jobs_table_arn] : []
    content {
      sid       = "ReadVodJobStatus"
      effect    = "Allow"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = var.audio_bucket_arn != null ? [var.audio_bucket_arn] : []
    content {
      sid       = "BrokerAudioObjects"
      effect    = "Allow"
      actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      resources = ["${statement.value}/*"]
    }
  }

  dynamic "statement" {
    for_each = var.audio_admin_key_param_arn != null ? [var.audio_admin_key_param_arn] : []
    content {
      sid       = "ReadAudioAdminKey"
      effect    = "Allow"
      actions   = ["ssm:GetParameter"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = (
      var.telemetry_queue_arn != null || var.telemetry_dlq_arn != null
    ) ? [1] : []
    content {
      sid     = "ReadTelemetryQueueDepth"
      effect  = "Allow"
      actions = ["sqs:GetQueueAttributes"]
      resources = compact([
        var.telemetry_queue_arn != null ? var.telemetry_queue_arn : "",
        var.telemetry_dlq_arn != null ? var.telemetry_dlq_arn : "",
      ])
    }
  }

  dynamic "statement" {
    for_each = var.telemetry_metrics_table_arn != null ? [var.telemetry_metrics_table_arn] : []
    content {
      sid       = "ReadTelemetryMetrics"
      effect    = "Allow"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_user_policy" "platform" {
  name   = "${var.name_prefix}-broker-policy"
  user   = aws_iam_user.platform.name
  policy = data.aws_iam_policy_document.platform.json
}
