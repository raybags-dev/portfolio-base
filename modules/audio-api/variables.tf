variable "name_prefix" {
  type = string
}

variable "bucket_suffix" {
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

variable "api_source_dir" {
  type = string
}

variable "stream_url_ttl_seconds" {
  description = "Pre-signed stream URL lifetime - short keeps demo bandwidth bounded."
  type        = number
  default     = 3600
}
