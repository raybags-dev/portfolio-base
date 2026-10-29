terraform {
  required_version = ">= 1.6.0"

  # Local state on purpose: one folder = one lab. `make down` removes everything it created.
  # If you later move to a remote backend, bootstrap it OUTSIDE this stack so teardown never deletes its own state.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.82, < 7.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
