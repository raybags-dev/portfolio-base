variable "name_prefix" {
  type = string
}

# Each of these is null when its project module is disabled, and the matching
# policy statements are simply omitted.
variable "vod_raw_bucket_arn" {
  type    = string
  default = null
}

variable "vod_jobs_table_arn" {
  type    = string
  default = null
}

variable "audio_bucket_arn" {
  type    = string
  default = null
}

variable "audio_admin_key_param_arn" {
  type    = string
  default = null
}

variable "telemetry_queue_arn" {
  type    = string
  default = null
}

variable "telemetry_dlq_arn" {
  type    = string
  default = null
}

variable "telemetry_metrics_table_arn" {
  type    = string
  default = null
}
