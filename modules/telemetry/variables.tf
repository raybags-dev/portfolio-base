variable "name_prefix" {
  type = string
}

variable "runtime" {
  type = string
}

variable "architecture" {
  type = string
}

variable "log_retention_days" {
  type = number
}

variable "cors_allowed_origins" {
  type = list(string)
}

variable "enable_access_logs" {
  type = bool
}

variable "consumer_max_concurrency" {
  type = number
}

variable "alert_topic_arn" {
  description = "SNS topic ARN for the DLQ alarm; null when alerts are disabled."
  type        = string
  nullable    = true
}

variable "ingest_source_dir" {
  type = string
}

variable "consumer_source_dir" {
  type = string
}

variable "metrics_ttl_days" {
  description = "Telemetry rows expire via DynamoDB TTL - time-series demo data must not accrue cost."
  type        = number
  default     = 7
}
