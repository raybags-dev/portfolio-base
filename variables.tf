variable "project_name" {
  description = "Short name used in resource names and the Project tag."
  type        = string
  default     = "medialab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.project_name))
    error_message = "project_name must be 3-20 chars: lowercase letters, digits, hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "Environment label (dev, test, ...)."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "Region to deploy into. CloudFront is global but is managed from here too."
  type        = string
  default     = "eu-west-1"
}

variable "aws_profile" {
  description = "Optional named AWS CLI profile."
  type        = string
  default     = null
}

# ---------------------------------------------------------------- project toggles
variable "enable_vod" {
  description = "Project 1: VOD / HLS pipeline (S3, MediaConvert, CloudFront)."
  type        = bool
  default     = true
}

variable "enable_audio_api" {
  description = "Project 2: audio / podcast API (API Gateway, Lambda, DynamoDB)."
  type        = bool
  default     = true
}

variable "enable_telemetry" {
  description = "Project 3: telemetry ingestion (API Gateway, SQS, Lambda, DynamoDB)."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------- lambda settings
variable "lambda_source_dirs" {
  description = <<-EOT
    Override the placeholder handlers with your built code. Keys:
    vod_transcode, vod_status, audio_api, telemetry_ingest, telemetry_consumer.
    Each value is a directory containing index.mjs (see README). Paths are relative to this folder.
  EOT
  type        = map(string)
  default     = {}
}

variable "lambda_runtime" {
  type    = string
  default = "nodejs22.x"
}

variable "lambda_architecture" {
  description = "arm64 is cheaper and fine for Node."
  type        = string
  default     = "arm64"
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "cors_allowed_origins" {
  description = "Origins allowed by API Gateway and the S3 buckets (browser uploads/streaming). Tighten for anything real."
  type        = list(string)
  default     = ["*"]
}

variable "enable_api_access_logs" {
  description = "API Gateway access logs. Needs logs:* delivery permissions on the deploying principal; leave off until the rest works."
  type        = bool
  default     = false
}

variable "telemetry_consumer_max_concurrency" {
  description = "Caps parallel consumer Lambdas so DynamoDB and your account concurrency are protected (min 2)."
  type        = number
  default     = 10

  validation {
    condition     = var.telemetry_consumer_max_concurrency >= 2
    error_message = "SQS event source max concurrency must be at least 2."
  }
}

# ---------------------------------------------------------------- cost / alerting guardrails
variable "alert_email" {
  description = "If set: creates an SNS topic (DLQ alarm) and an account-level budget alert sent to this address."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Account-wide monthly budget for the alert (only if alert_email is set). 0 disables."
  type        = number
  default     = 10
}
