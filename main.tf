data "aws_caller_identity" "current" {}

# Globally-unique suffix for S3 bucket names.
resource "random_id" "suffix" {
  byte_length = 3
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  suffix      = random_id.suffix.hex

  # Placeholder handlers let `terraform apply` succeed before any real code exists.
  # Real builds replace them through var.lambda_source_dirs.
  stub_root = "${path.root}/stubs"
  source_dirs = merge(
    {
      vod_transcode      = "${local.stub_root}/vod-transcode"
      vod_status         = "${local.stub_root}/vod-status"
      audio_api          = "${local.stub_root}/audio-api"
      telemetry_ingest   = "${local.stub_root}/telemetry-ingest"
      telemetry_consumer = "${local.stub_root}/telemetry-consumer"
    },
    var.lambda_source_dirs
  )

  alerts_enabled  = var.alert_email != ""
  budget_enabled  = local.alerts_enabled && var.monthly_budget_usd > 0
  alert_topic_arn = local.alerts_enabled ? aws_sns_topic.alerts[0].arn : null
}

# ------------------------------------------------------------------ shared guardrails
resource "aws_sns_topic" "alerts" {
  count = local.alerts_enabled ? 1 : 0
  name  = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = local.alerts_enabled ? 1 : 0
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Account-wide (not filtered by tag: cost-allocation tags need separate activation). Destroyed with the stack.
resource "aws_budgets_budget" "monthly" {
  count        = local.budget_enabled ? 1 : 0
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

# ------------------------------------------------------------------ Project 1: VOD / HLS
module "vod_pipeline" {
  count  = var.enable_vod ? 1 : 0
  source = "./modules/vod-pipeline"

  name_prefix          = "${local.name_prefix}-vod"
  bucket_suffix        = local.suffix
  runtime              = var.lambda_runtime
  architecture         = var.lambda_architecture
  log_retention_days   = var.log_retention_days
  cors_allowed_origins = var.cors_allowed_origins
  transcode_source_dir = local.source_dirs["vod_transcode"]
  status_source_dir    = local.source_dirs["vod_status"]
}

# ------------------------------------------------------------------ Project 2: audio API
module "audio_api" {
  count  = var.enable_audio_api ? 1 : 0
  source = "./modules/audio-api"

  name_prefix          = "${local.name_prefix}-audio"
  bucket_suffix        = local.suffix
  runtime              = var.lambda_runtime
  architecture         = var.lambda_architecture
  log_retention_days   = var.log_retention_days
  cors_allowed_origins = var.cors_allowed_origins
  enable_access_logs   = var.enable_api_access_logs
  api_source_dir       = local.source_dirs["audio_api"]
}

# ------------------------------------------------------------------ Project 3: telemetry
module "telemetry" {
  count  = var.enable_telemetry ? 1 : 0
  source = "./modules/telemetry"

  name_prefix              = "${local.name_prefix}-telemetry"
  runtime                  = var.lambda_runtime
  architecture             = var.lambda_architecture
  log_retention_days       = var.log_retention_days
  cors_allowed_origins     = var.cors_allowed_origins
  enable_access_logs       = var.enable_api_access_logs
  consumer_max_concurrency = var.telemetry_consumer_max_concurrency
  alert_topic_arn          = local.alert_topic_arn
  ingest_source_dir        = local.source_dirs["telemetry_ingest"]
  consumer_source_dir      = local.source_dirs["telemetry_consumer"]
}

# ------------------------------------------------------- platform broker IAM
# One least-privilege IAM user for the raybags.com FastAPI broker. Statements
# are scoped to the exact resources above; disabled projects contribute none.
module "platform_access" {
  source = "./modules/platform-access"

  name_prefix                 = local.name_prefix
  vod_raw_bucket_arn          = var.enable_vod ? module.vod_pipeline[0].raw_bucket_arn : null
  vod_jobs_table_arn          = var.enable_vod ? module.vod_pipeline[0].jobs_table_arn : null
  audio_bucket_arn            = var.enable_audio_api ? module.audio_api[0].audio_bucket_arn : null
  audio_admin_key_param_arn   = var.enable_audio_api ? module.audio_api[0].admin_api_key_param_arn : null
  telemetry_queue_arn         = var.enable_telemetry ? module.telemetry[0].queue_arn : null
  telemetry_dlq_arn           = var.enable_telemetry ? module.telemetry[0].dlq_arn : null
  telemetry_metrics_table_arn = var.enable_telemetry ? module.telemetry[0].metrics_table_arn : null
}
