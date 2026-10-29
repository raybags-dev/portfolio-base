provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Every taggable resource gets these. scripts/leftovers.sh finds orphans by the Project tag.
  default_tags {
    tags = {
      Project   = var.project_name
      Env       = var.environment
      ManagedBy = "terraform"
    }
  }
}
