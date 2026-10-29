// Standardized API contracts (AGENTS.md §7): every HTTP handler returns
// { success: true, data } or { success: false, message } (+ optional code).

export interface SuccessBody<T> {
  success: true;
  data: T;
}

export interface FailureBody {
  success: false;
  message: string;
  code?: string;
}

export const ok = <T>(data: T): SuccessBody<T> => ({ success: true, data });

export const fail = (message: string, code?: string): FailureBody =>
  code === undefined ? { success: false, message } : { success: false, message, code };

interface ApiGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS: Record<string, string> = { "content-type": "application/json" };

export const respond = <T>(statusCode: number, body: SuccessBody<T> | FailureBody): ApiGatewayResponse => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export const respondOk = <T>(data: T, statusCode = 200): ApiGatewayResponse =>
  respond(statusCode, ok(data));

export const respondFail = (statusCode: number, message: string, code?: string): ApiGatewayResponse =>
  respond(statusCode, fail(message, code));
