// Admin API key from SSM (SecureString), cached per warm container.

import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { ssmClient } from "../../shared/aws-clients.js";
import { requireEnv } from "../../shared/config.js";

let cachedKey: string | undefined;

export async function getAdminKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const name = requireEnv("ADMIN_API_KEY_SSM");
  const res = await ssmClient().send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} has no value`);
  cachedKey = value;
  return value;
}

// Test hook: reset the cache between unit tests.
export function _resetAdminKeyCache(): void {
  cachedKey = undefined;
}
