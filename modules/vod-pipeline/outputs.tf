output "raw_bucket_name" {
  value = aws_s3_bucket.raw.id
}

output "raw_bucket_arn" {
  value = aws_s3_bucket.raw.arn
}

output "processed_bucket_name" {
  value = aws_s3_bucket.processed.id
}

output "processed_bucket_arn" {
  value = aws_s3_bucket.processed.arn
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.hls.domain_name
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.hls.arn
}

output "mediaconvert_queue_arn" {
  value = aws_media_convert_queue.main.arn
}

output "jobs_table_name" {
  value = aws_dynamodb_table.jobs.name
}

output "jobs_table_arn" {
  value = aws_dynamodb_table.jobs.arn
}

output "transcode_function_name" {
  value = aws_lambda_function.transcode.function_name
}
