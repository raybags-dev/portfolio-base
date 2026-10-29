// Lazy AWS SDK v3 client singletons. Clients are created once per warm
// Lambda container; constructing them lazily keeps cold starts fast and lets
// unit tests substitute aws-sdk-client-mock before first use.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { MediaConvertClient } from "@aws-sdk/client-mediaconvert";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SSMClient } from "@aws-sdk/client-ssm";

let ddbDoc: DynamoDBDocumentClient | undefined;
let mediaConvert: MediaConvertClient | undefined;
let s3: S3Client | undefined;
let sqs: SQSClient | undefined;
let ssm: SSMClient | undefined;

export function docClient(): DynamoDBDocumentClient {
  ddbDoc ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return ddbDoc;
}

export function mediaConvertClient(): MediaConvertClient {
  mediaConvert ??= new MediaConvertClient({});
  return mediaConvert;
}

export function s3Client(): S3Client {
  s3 ??= new S3Client({});
  return s3;
}

export function sqsClient(): SQSClient {
  sqs ??= new SQSClient({});
  return sqs;
}

export function ssmClient(): SSMClient {
  ssm ??= new SSMClient({});
  return ssm;
}
