output "ingest_url" {
  value = "${aws_apigatewayv2_stage.default.invoke_url}/events"
}

output "queue_url" {
  value = aws_sqs_queue.main.url
}

output "queue_arn" {
  value = aws_sqs_queue.main.arn
}

output "dlq_url" {
  value = aws_sqs_queue.dlq.url
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}

output "metrics_table_name" {
  value = aws_dynamodb_table.metrics.name
}

output "metrics_table_arn" {
  value = aws_dynamodb_table.metrics.arn
}
