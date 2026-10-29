# Project 2: High-Traffic Audio & Podcast Stream API
# API Gateway (HTTP API) -> Lambda (Express) -> DynamoDB + S3 presigned audio.

locals {
  tracks_table_name   = "${var.name_prefix}-tracks"
  progress_table_name = "${var.name_prefix}-progress"
  audio_bucket_name   = "${var.name_prefix}-audio-${var.bucket_suffix}"
  fn_name             = "${var.name_prefix}-api"
  admin_key_ssm_name  = "/${var.name_prefix}/admin-api-key"
}

# ------------------------------------------------------------------ DynamoDB
resource "aws_dynamodb_table" "tracks" {
  name         = local.tracks_table_name
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "publishedAt"
    type = "S"
  }

  global_secondary_index {
    name            = "byPublishedAt"
    projection_type = "ALL"

    key_schema {
      attribute_name = "publishedAt"
      key_type       = "HASH"
    }
  }
}

resource "aws_dynamodb_table" "progress" {
  name         = local.progress_table_name
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "trackId"
  range_key = "listenerId"

  attribute {
    name = "trackId"
    type = "S"
  }

  attribute {
    name = "listenerId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# ------------------------------------------------------------------ audio S3
resource "aws_s3_bucket" "audio" {
  bucket        = local.audio_bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "audio" {
  bucket                  = aws_s3_bucket.audio.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag", "Content-Length", "Content-Range"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    id     = "expire-demo-audio"
    status = "Enabled"

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ------------------------------------------------------- admin API key (SSM)
resource "random_password" "admin_key" {
  length  = 40
  special = false
}

resource "aws_ssm_parameter" "admin_key" {
  name        = local.admin_key_ssm_name
  description = "Admin API key for POST /tracks on ${var.name_prefix}"
  type        = "SecureString"
  value       = random_password.admin_key.result
}

# ------------------------------------------------------------------- lambda
data "archive_file" "api" {
  type        = "zip"
  source_dir  = var.api_source_dir
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.fn_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "api" {
  name = "${local.fn_name}-role"

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

resource "aws_iam_role_policy" "api" {
  name = "${local.fn_name}-policy"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.api.arn}:*"]
      },
      {
        Sid    = "TracksAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.tracks.arn,
          "${aws_dynamodb_table.tracks.arn}/index/*"
        ]
      },
      {
        Sid      = "ProgressAccess"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = [aws_dynamodb_table.progress.arn]
      },
      {
        # Presigned-URL generation needs no S3 data-plane call, but the signer
        # identity must hold the permission it vends.
        Sid      = "SignAudioObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = ["${aws_s3_bucket.audio.arn}/*"]
      },
      {
        Sid      = "ReadAdminKey"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [aws_ssm_parameter.admin_key.arn]
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = local.fn_name
  role             = aws_iam_role.api.arn
  runtime          = var.runtime
  architectures    = [var.architecture]
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      TRACKS_TABLE         = aws_dynamodb_table.tracks.name
      PROGRESS_TABLE       = aws_dynamodb_table.progress.name
      AUDIO_BUCKET         = aws_s3_bucket.audio.id
      ADMIN_API_KEY_SSM    = aws_ssm_parameter.admin_key.name
      STREAM_URL_TTL       = tostring(var.stream_url_ttl_seconds)
      CORS_ALLOWED_ORIGINS = join(",", var.cors_allowed_origins)
    }
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

# -------------------------------------------------------------- HTTP API GW
resource "aws_apigatewayv2_api" "main" {
  name          = var.name_prefix
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "PATCH", "OPTIONS"]
    allow_headers = ["content-type", "x-api-key", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
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
        requestId      = "$context.requestId"
        ip             = "$context.identity.sourceIp"
        requestTime    = "$context.requestTime"
        httpMethod     = "$context.httpMethod"
        routeKey       = "$context.routeKey"
        status         = "$context.status"
        responseLength = "$context.responseLength"
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
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
