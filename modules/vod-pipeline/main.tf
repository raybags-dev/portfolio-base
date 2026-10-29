# Project 1: VOD & HLS Packaging Pipeline
# raw upload (private) -> S3 event -> Lambda -> MediaConvert -> HLS in
# processed bucket -> CloudFront (OAC). Status via EventBridge -> DynamoDB.

locals {
  raw_bucket_name       = "${var.name_prefix}-raw-${var.bucket_suffix}"
  processed_bucket_name = "${var.name_prefix}-hls-${var.bucket_suffix}"
  jobs_table_name       = "${var.name_prefix}-jobs"
  transcode_fn_name     = "${var.name_prefix}-transcode"
  status_fn_name        = "${var.name_prefix}-status"
  queue_name            = "${var.name_prefix}-queue"
}

# ---------------------------------------------------------------- raw uploads
resource "aws_s3_bucket" "raw" {
  bucket        = local.raw_bucket_name
  force_destroy = true # tryout bucket: teardown must not fail on leftover uploads
}

resource "aws_s3_bucket_public_access_block" "raw" {
  bucket                  = aws_s3_bucket.raw.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "HEAD", "GET"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    id     = "expire-raw-uploads"
    status = "Enabled"

    expiration {
      days = var.raw_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_partition" "current" {}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# ------------------------------------------------------------ processed (HLS)
resource "aws_s3_bucket" "processed" {
  bucket        = local.processed_bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "processed" {
  bucket                  = aws_s3_bucket.processed.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "processed" {
  bucket = aws_s3_bucket.processed.id

  rule {
    id     = "expire-hls-outputs"
    status = "Enabled"

    expiration {
      days = var.processed_expiration_days
    }
  }
}

resource "aws_s3_bucket_policy" "processed" {
  bucket = aws_s3_bucket.processed.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.processed.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.hls.arn
          }
        }
      }
    ]
  })
}

# ----------------------------------------------------------------- CloudFront
resource "aws_cloudfront_origin_access_control" "hls" {
  name                              = "${var.name_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "hls" {
  comment         = "${var.name_prefix} HLS streaming"
  enabled         = true
  is_ipv6_enabled = true
  price_class     = "PriceClass_100" # EU/US edge only - cheapest tier
  http_version    = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.processed.bucket_regional_domain_name
    origin_id                = "s3-hls"
    origin_access_control_id = aws_cloudfront_origin_access_control.hls.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-hls"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # HLS manifests must refresh quickly; segments cache long.
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "cors_s3" {
  name = "Managed-CORS-S3Origin"
}

# ------------------------------------------------------------------ DynamoDB
resource "aws_dynamodb_table" "jobs" {
  name         = local.jobs_table_name
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# ------------------------------------------------------- MediaConvert service
resource "aws_iam_role" "mediaconvert" {
  name = "${var.name_prefix}-mediaconvert-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "mediaconvert.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "mediaconvert" {
  name = "${var.name_prefix}-mediaconvert-policy"
  role = aws_iam_role.mediaconvert.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadRawUploads"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${aws_s3_bucket.raw.arn}/*"]
      },
      {
        Sid      = "WriteHlsOutputs"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = ["${aws_s3_bucket.processed.arn}/*"]
      }
    ]
  })
}

resource "aws_media_convert_queue" "main" {
  name   = local.queue_name
  status = "ACTIVE"
}

# ------------------------------------------------------------- transcode fn
data "archive_file" "transcode" {
  type        = "zip"
  source_dir  = var.transcode_source_dir
  output_path = "${path.module}/.build/transcode.zip"
}

resource "aws_cloudwatch_log_group" "transcode" {
  name              = "/aws/lambda/${local.transcode_fn_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "transcode" {
  name = "${local.transcode_fn_name}-role"

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

resource "aws_iam_role_policy" "transcode" {
  name = "${local.transcode_fn_name}-policy"
  role = aws_iam_role.transcode.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.transcode.arn}:*"]
      },
      {
        Sid    = "SubmitMediaConvertJobs"
        Effect = "Allow"
        Action = ["mediaconvert:CreateJob"]
        Resource = [
          aws_media_convert_queue.main.arn,
          # job templates and presets are referenced by ARN at submit time
          "arn:${data.aws_partition.current.partition}:mediaconvert:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:presets/*",
          "arn:${data.aws_partition.current.partition}:mediaconvert:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:jobTemplates/*"
        ]
      },
      {
        Sid      = "ReadMediaConvertJobs"
        Effect   = "Allow"
        Action   = ["mediaconvert:GetJob"]
        Resource = ["arn:${data.aws_partition.current.partition}:mediaconvert:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:jobs/*"]
      },
      {
        # DescribeEndpoints is account-scoped discovery and cannot be narrowed
        # (AWS-documented); it exposes no resources itself.
        Sid      = "DiscoverMediaConvertEndpoint"
        Effect   = "Allow"
        Action   = ["mediaconvert:DescribeEndpoints"]
        Resource = ["*"]
      },
      {
        Sid      = "PassRoleToMediaConvert"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.mediaconvert.arn]
        Condition = {
          StringEquals = { "iam:PassedToService" = "mediaconvert.amazonaws.com" }
        }
      },
      {
        Sid      = "WriteJobRecords"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem"]
        Resource = [aws_dynamodb_table.jobs.arn]
      }
    ]
  })
}

resource "aws_lambda_function" "transcode" {
  function_name    = local.transcode_fn_name
  role             = aws_iam_role.transcode.arn
  runtime          = var.runtime
  architectures    = [var.architecture]
  handler          = "index.handler"
  filename         = data.archive_file.transcode.output_path
  source_code_hash = data.archive_file.transcode.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      JOBS_TABLE             = aws_dynamodb_table.jobs.name
      PROCESSED_BUCKET       = aws_s3_bucket.processed.id
      MEDIACONVERT_QUEUE_ARN = aws_media_convert_queue.main.arn
      MEDIACONVERT_ROLE_ARN  = aws_iam_role.mediaconvert.arn
      CLOUDFRONT_DOMAIN      = aws_cloudfront_distribution.hls.domain_name
      MAX_OUTPUT_HEIGHT      = tostring(var.max_output_height)
    }
  }

  depends_on = [aws_cloudwatch_log_group.transcode]
}

resource "aws_lambda_permission" "s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.transcode.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.raw.arn
}

resource "aws_s3_bucket_notification" "raw_upload" {
  bucket = aws_s3_bucket.raw.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.transcode.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".mp4"
  }

  depends_on = [aws_lambda_permission.s3_invoke]
}

# ---------------------------------------------------------------- status fn
data "archive_file" "status" {
  type        = "zip"
  source_dir  = var.status_source_dir
  output_path = "${path.module}/.build/status.zip"
}

resource "aws_cloudwatch_log_group" "status" {
  name              = "/aws/lambda/${local.status_fn_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "status" {
  name = "${local.status_fn_name}-role"

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

resource "aws_iam_role_policy" "status" {
  name = "${local.status_fn_name}-policy"
  role = aws_iam_role.status.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.status.arn}:*"]
      },
      {
        Sid      = "UpdateJobRecords"
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:GetItem"]
        Resource = [aws_dynamodb_table.jobs.arn]
      }
    ]
  })
}

resource "aws_lambda_function" "status" {
  function_name    = local.status_fn_name
  role             = aws_iam_role.status.arn
  runtime          = var.runtime
  architectures    = [var.architecture]
  handler          = "index.handler"
  filename         = data.archive_file.status.output_path
  source_code_hash = data.archive_file.status.output_base64sha256
  timeout          = 15
  memory_size      = 128

  environment {
    variables = {
      JOBS_TABLE = aws_dynamodb_table.jobs.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.status]
}

# EventBridge: MediaConvert emits state changes on the default bus.
resource "aws_cloudwatch_event_rule" "mediaconvert_state" {
  name        = "${var.name_prefix}-mc-state"
  description = "MediaConvert COMPLETE/ERROR -> job status updater"

  event_pattern = jsonencode({
    source      = ["aws.mediaconvert"]
    detail-type = ["MediaConvert Job State Change"]
    detail = {
      status = ["COMPLETE", "ERROR"]
      queue  = [aws_media_convert_queue.main.arn]
    }
  })
}

resource "aws_cloudwatch_event_target" "status" {
  rule = aws_cloudwatch_event_rule.mediaconvert_state.name
  arn  = aws_lambda_function.status.arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.status.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.mediaconvert_state.arn
}
