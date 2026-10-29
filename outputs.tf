output "project_name" {
  value = var.project_name
}

output "aws_region" {
  value = var.aws_region
}

output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "vod" {
  description = "Project 1 endpoints and names."
  value = var.enable_vod ? {
    raw_bucket       = module.vod_pipeline[0].raw_bucket_name
    processed_bucket = module.vod_pipeline[0].processed_bucket_name
    cloudfront_url   = "https://${module.vod_pipeline[0].cloudfront_domain}"
    queue_arn        = module.vod_pipeline[0].mediaconvert_queue_arn
    jobs_table       = module.vod_pipeline[0].jobs_table_name
    transcode_fn     = module.vod_pipeline[0].transcode_function_name
  } : null
}

output "audio" {
  description = "Project 2 endpoints and names."
  value = var.enable_audio_api ? {
    api_url            = module.audio_api[0].api_url
    tracks_table       = module.audio_api[0].tracks_table_name
    progress_table     = module.audio_api[0].progress_table_name
    audio_bucket       = module.audio_api[0].audio_bucket_name
    admin_key_ssm_name = module.audio_api[0].admin_api_key_param_name
  } : null
}

output "audio_admin_api_key" {
  description = "Admin key for POST /tracks (also stored in SSM). Read with: terraform output -raw audio_admin_api_key"
  value       = var.enable_audio_api ? module.audio_api[0].admin_api_key : null
  sensitive   = true
}

output "telemetry" {
  description = "Project 3 endpoints and names."
  value = var.enable_telemetry ? {
    ingest_url    = module.telemetry[0].ingest_url
    queue_url     = module.telemetry[0].queue_url
    dlq_url       = module.telemetry[0].dlq_url
    metrics_table = module.telemetry[0].metrics_table_name
  } : null
}

output "platform_broker" {
  description = "Least-privilege IAM credentials for the raybags.com FastAPI broker (store in admin panel)."
  value = {
    user_name     = module.platform_access.broker_user_name
    access_key_id = module.platform_access.broker_access_key_id
  }
}

output "platform_broker_secret" {
  description = "Broker secret key. Read with: terraform output -raw platform_broker_secret"
  value       = module.platform_access.broker_secret_access_key
  sensitive   = true
}
