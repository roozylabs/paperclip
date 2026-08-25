import type { AdapterExecutionResult } from "@paperclipai/adapter-utils";

export type GatewayErrorCode =
  | "prism_roozylabs_base_url_missing"
  | "prism_roozylabs_base_url_invalid"
  | "prism_roozylabs_api_key_missing"
  | "prism_roozylabs_auth_failed"
  | "prism_roozylabs_forbidden"
  | "prism_roozylabs_bad_request"
  | "prism_roozylabs_model_not_found"
  | "prism_roozylabs_rate_limited"
  | "prism_roozylabs_upstream_error"
  | "prism_roozylabs_timeout"
  | "prism_roozylabs_connect_failed"
  | "prism_roozylabs_protocol_error"
  | "prism_roozylabs_tool_calls_unsupported"
  | "prism_roozylabs_plain_http_denied"
  | (string & {});

export interface GatewayHttpError extends Error {
  status?: number;
  code?: GatewayErrorCode;
  retryNotBefore?: string | null;
  body?: unknown;
}

export function classifyHttpStatus(
  status: number,
): { code: GatewayErrorCode; family: AdapterExecutionResult["errorFamily"] } {
  if (status === 401 || status === 403)
    return { code: "prism_roozylabs_auth_failed", family: null };
  if (status === 404)
    return { code: "prism_roozylabs_model_not_found", family: null };
  if (status === 429)
    return {
      code: "prism_roozylabs_rate_limited",
      family: "transient_upstream",
    };
  if (status >= 500)
    return {
      code: "prism_roozylabs_upstream_error",
      family: "transient_upstream",
    };
  if (status === 400)
    return { code: "prism_roozylabs_bad_request", family: null };
  return { code: "prism_roozylabs_upstream_error", family: null };
}

export function createGatewayError(
  message: string,
  status?: number,
  body?: unknown,
  retryNotBefore?: string | null,
): GatewayHttpError {
  const err = new Error(message) as GatewayHttpError;
  if (status != null) err.status = status;
  if (body != null) err.body = body;
  if (retryNotBefore != null) err.retryNotBefore = retryNotBefore;
  if (status != null) {
    const classified = classifyHttpStatus(status);
    err.code = classified.code;
  }
  return err;
}

export function fetchFailureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error ? (err as { cause?: unknown }).cause : null;
  if (!cause || typeof cause !== "object") return message;
  const rec = cause as { code?: unknown; message?: unknown };
  const causeMessage =
    typeof rec.message === "string" ? rec.message : "";
  const causeCode = typeof rec.code === "string" ? rec.code : "";
  if (!causeMessage || causeMessage === message)
    return causeCode ? `${message} (${causeCode})` : message;
  return causeCode
    ? `${message} (${causeCode}: ${causeMessage})`
    : `${message} (${causeMessage})`;
}

export function errorResult(
  err: unknown,
  redactText: (v: string) => string = (v) => v,
): AdapterExecutionResult {
  const gwErr = err as GatewayHttpError;
  const code = gwErr.code ?? "prism_roozylabs_protocol_error";
  const classified = gwErr.status ? classifyHttpStatus(gwErr.status) : null;
  const errorMessage =
    code === "prism_roozylabs_auth_failed"
      ? `${redactText(err instanceof Error ? err.message : String(err))}. Verify apiKey matches your Prism Gateway key (gw_sk_prism_...).`
      : redactText(err instanceof Error ? err.message : String(err));
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorCode: code,
    errorFamily:
      classified?.family ??
      (code === "prism_roozylabs_connect_failed" ? "transient_upstream" : null),
    retryNotBefore: gwErr.retryNotBefore ?? null,
    errorMessage,
    errorMeta: {
      ...(gwErr.status ? { status: gwErr.status } : {}),
      ...(gwErr.body
        ? { body: gwErr.body as Record<string, unknown> }
        : {}),
    },
  };
}
