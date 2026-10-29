variable "name_prefix" {
  type = string
}

variable "bucket_suffix" {
  description = "Globally-unique suffix from the root module (random_id)."
  type        = string
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

variable "transcode_source_dir" {
  type = string
}

variable "status_source_dir" {
  type = string
}

# ---------------------------------------------------------------- cost guardrails
variable "raw_expiration_days" {
  description = "Raw uploads expire automatically - leftover uploads must not accrue storage cost."
  type        = number
  default     = 2
}

variable "processed_expiration_days" {
  description = "HLS outputs expire automatically - demo streams are disposable."
  type        = number
  default     = 7
}

variable "max_output_height" {
  description = "Hard cap on transcode output height (AGENTS.md cost rule: never multi-pass 4K)."
  type        = number
  default     = 1080

  validation {
    condition     = var.max_output_height <= 1080
    error_message = "Dev/tryout profiles are capped at 1080p."
  }
}
