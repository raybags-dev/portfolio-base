# Project 3: Real-Time Live Stream Ingestion & Analytics Collector
# API GW -> ingest Lambda -> SQS -> consumer Lambda -> DynamoDB (time series).
# DLQ with an SNS alarm; consumer concurrency is capped to protect the account.

locals {
  queue_name         = "${var.name_prefix}-ingest"
  dlq_name           = "${var.name_prefix}-dlq"
  metrics_table_name = "${var.name_prefix}-metrics"
  ingest_fn_name     = "${var.name_prefix}-ingest"
  consumer_fn_name   = "${var.name_prefix}-consumer"
}

# ----------------------------------------------------------------------- SQS
resource "aws_sqs_queue" "dlq" {
  name                      = local.dlq_name
  message_retention_seconds = 1209600 # 14 days to inspect failures
}

resource "aws_sqs_queue" "main" {
  name                       = local.queue_name
  visibility_timeout_seconds = 60 # >= consumer lambda timeout
  receive_wait_time_seconds  = 5  # long polling - fewer empty receives, lower cost

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  count = var.alert_topic_arn != null ? 1 : 0

  alarm_name          = "${var.name_prefix}-dlq-not-empty"
  alarm_description   = "Telemetry events are failing into the DLQ"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]
}

# ------------------------------------------------------------------ DynamoDB
resource "aws_dynamodb_table" "metrics" {
  name         = local.metrics_table_name
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "sessionId"
  range_key = "ts"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "ts"
    type = "N"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# --------------------------------------------------------------- ingest fn
data "archive_file" "ingest" {
  type        = "zip"
  source_dir  = var.ingest_source_dir
  output_path = "${path.module}/.build/ingest.zip"
}

resource "aws_cloudwatch_log_group" "ingest" {
  name              = "/aws/lambda/${local.ingest_fn_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "ingest" {
  name = "${local.ingest_fn_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ingest" {
  name = "${local.ingest_fn_name}-policy"
  role = aws_iam_role.ingest.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.ingest.arn}:*"]
      },
      {
        Sid      = "EnqueueTelemetry"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:SendMessageBatch"]
        Resource = [aws_sqs_queue.main.arn]
      }
    ]
  })
}

resource "aws_lambda_function" "ingest" {
  function_name    = local.ingest_fn_name
  role             = aws_iam_role.ingest.arn
  runtime          = var.runtime
  architectures    = [var.architecture]
  handler          = "index.handler"
  filename         = data.archive_file.ingest.output_path
  source_code_hash = data.archive_file.ingest.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      QUEUE_URL = aws_sqs_queue.main.url
    }
  }

  depends_on = [aws_cloudwatch_log_group.ingest]
}

# -------------------------------------------------------------- consumer fn
data "archive_file" "consumer" {
  type        = "zip"
  source_dir  = var.consumer_source_dir
  output_path = "${path.module}/.build/consumer.zip"
}

resource "aws_cloudwatch_log_group" "consumer" {
  name              = "/aws/lambda/${local.consumer_fn_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "consumer" {
  name = "${local.consumer_fn_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "consumer" {
  name = "${local.consumer_fn_name}-policy"
  role = aws_iam_role.consumer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.consumer.arn}:*"]
      },
      {
        Sid    = "PollQueue"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage", "sqs:DeleteMessage",
          "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"
        ]
        Resource = [aws_sqs_queue.main.arn]
      },
      {
        Sid    = "WriteMetrics"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem", "dynamodb:BatchWriteItem",
          "dynamodb:UpdateItem", "dynamodb:GetItem"
        ]
        Resource = [aws_dynamodb_table.metrics.arn]
      }
    ]
  })
}

resource "aws_lambda_function" "consumer" {
  function_name    = local.consumer_fn_name
  role             = aws_iam_role.consumer.arn
  runtime          = var.runtime
  architectures    = [var.architecture]
  handler          = "index.handler"
  filename         = data.archive_file.consumer.output_path
  source_code_hash = data.archive_file.consumer.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      METRICS_TABLE    = aws_dynamodb_table.metrics.name
      METRICS_TTL_DAYS = tostring(var.metrics_ttl_days)
    }
  }

  depends_on = [aws_cloudwatch_log_group.consumer]
}

resource "aws_lambda_event_source_mapping" "queue" {
  event_source_arn                   = aws_sqs_queue.main.arn
  function_name                      = aws_lambda_function.consumer.arn
  batch_size                         = 100
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.consumer_max_concurrency
  }
}

# -------------------------------------------------------------- HTTP API GW
resource "aws_apigatewayv2_api" "main" {
  name          = var.name_prefix
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type", "x-burst-token"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "ingest" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ingest.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ingest" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /events"
  target    = "integrations/${aws_apigatewayv2_integration.ingest.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  dynamic "access_log_settings" {
    for_each = var.enable_access_logs ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.api_access[0].arn
      format = jsonencode({
        requestId   = "$context.requestId"
        ip          = "$context.identity.sourceIp"
        requestTime = "$context.requestTime"
        httpMethod  = "$context.httpMethod"
        routeKey    = "$context.routeKey"
        status      = "$context.status"
      })
    }
  }
}

resource "aws_cloudwatch_log_group" "api_access" {
  count             = var.enable_access_logs ? 1 : 0
  name              = "/aws/apigateway/${var.name_prefix}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
