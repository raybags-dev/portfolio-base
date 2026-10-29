output "broker_user_name" {
  value = aws_iam_user.platform.name
}

output "broker_access_key_id" {
  value = aws_iam_access_key.platform.id
}

output "broker_secret_access_key" {
  value     = aws_iam_access_key.platform.secret
  sensitive = true
}
