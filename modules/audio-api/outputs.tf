output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "tracks_table_name" {
  value = aws_dynamodb_table.tracks.name
}

output "tracks_table_arn" {
  value = aws_dynamodb_table.tracks.arn
}

output "progress_table_name" {
  value = aws_dynamodb_table.progress.name
}

output "progress_table_arn" {
  value = aws_dynamodb_table.progress.arn
}

output "audio_bucket_name" {
  value = aws_s3_bucket.audio.id
}

output "audio_bucket_arn" {
  value = aws_s3_bucket.audio.arn
}

output "admin_api_key_param_name" {
  value = aws_ssm_parameter.admin_key.name
}

output "admin_api_key_param_arn" {
  value = aws_ssm_parameter.admin_key.arn
}

output "admin_api_key" {
  value     = random_password.admin_key.result
  sensitive = true
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}
