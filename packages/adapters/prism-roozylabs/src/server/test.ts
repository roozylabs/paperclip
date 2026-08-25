import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import {
  allowsInsecureRemoteHttp,
  isLoopbackHostname,
  isRemotePlainHttp,
  remotePlainHttpDeniedMessage,
} from "./transport-security.js";
import { DEFAULT_BASE_URL } from "../shared/constants.js";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

function normalizeBaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function apiUrl(baseUrl: URL, path: string): string {
  let base = baseUrl.toString().replace(/\/+$/, "");
  if (path.startsWith("/v1/") && base.endsWith("/v1")) {
    base = base.slice(0, -3);
  }
  return `${base}${path}`;
}

function errorDetail(err: unknown): string {
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

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const baseUrlRaw =
    typeof ctx.config.baseUrl === "string"
      ? ctx.config.baseUrl.trim()
      : DEFAULT_BASE_URL;
  const apiKey = asString(ctx.config.apiKey, "").trim();

  if (!baseUrlRaw) {
    checks.push({
      code: "prism_roozylabs_base_url_missing",
      level: "error",
      message: "Prism RoozyLabs requires a baseUrl.",
      hint: "Set the Gateway URL, for example https://api.prism.roozylabs.com or http://localhost:8080.",
    });
  }

  const parsed = baseUrlRaw ? normalizeBaseUrl(baseUrlRaw) : null;
  if (baseUrlRaw && !parsed) {
    checks.push({
      code: "prism_roozylabs_base_url_invalid",
      level: "error",
      message: "baseUrl must be an http:// or https:// URL.",
    });
  }

  if (!apiKey) {
    checks.push({
      code: "prism_roozylabs_api_key_missing",
      level: "error",
      message: "Prism RoozyLabs requires an apiKey.",
      hint: "Set the Gateway API key (gw_sk_prism_...) in the adapter config.",
    });
  } else if (!apiKey.startsWith("gw_sk_")) {
    checks.push({
      code: "prism_roozylabs_api_key_prefix_warning",
      level: "warn",
      message: 'API key does not start with "gw_sk_". Verify this is a Prism Gateway key, not a provider key.',
    });
  }

  if (
    parsed &&
    isRemotePlainHttp(parsed) &&
    !allowsInsecureRemoteHttp(ctx.config)
  ) {
    checks.push({
      code: "prism_roozylabs_plain_http_denied",
      level: "error",
      message: remotePlainHttpDeniedMessage(parsed.hostname),
      hint: "Use https:// for remote gateways. Loopback http://localhost and http://127.0.0.1 remain allowed.",
    });
  } else if (parsed && isRemotePlainHttp(parsed)) {
    checks.push({
      code: "prism_roozylabs_plain_http_unsafe_allowed",
      level: "warn",
      message: "Unsafe dev escape hatch enabled for non-loopback HTTP traffic.",
      hint: "Remove the escape hatch and use HTTPS before using this gateway for real credentials.",
    });
  } else if (parsed?.protocol === "http:" && isLoopbackHostname(parsed.hostname)) {
    checks.push({
      code: "prism_roozylabs_loopback_http_allowed",
      level: "info",
      message: "Loopback HTTP Gateway URL is allowed.",
    });
  }

  if (
    checks.some((c) => c.level === "error") ||
    !parsed ||
    !apiKey
  ) {
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  try {
    const modelsUrl = apiUrl(parsed, "/v1/models");
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      checks.push({
        code: "prism_roozylabs_reachable",
        level: "info",
        message: "Gateway is reachable and authentication is valid.",
      });
      try {
        const body = await response.json() as { data?: Array<{ id: string }> };
        const modelIds = (body.data ?? []).map((m) => m.id);
        const configuredModel = asString(ctx.config.model, "prism-auto").trim();
        if (modelIds.includes(configuredModel)) {
          checks.push({
            code: "prism_roozylabs_model_available",
            level: "info",
            message: `Model "${configuredModel}" is available on the Gateway.`,
          });
        } else {
          checks.push({
            code: "prism_roozylabs_model_not_in_static_list",
            level: "warn",
            message: `Model "${configuredModel}" not found in the Gateway's static /v1/models list.`,
            hint: "The Gateway may still accept this model if it is configured in the dashboard. The static list may be stale.",
          });
        }
      } catch {
        checks.push({
          code: "prism_roozylabs_models_parse_error",
          level: "warn",
          message: "Could not parse the /v1/models response.",
        });
      }
    } else if (response.status === 401 || response.status === 403) {
      checks.push({
        code: "prism_roozylabs_auth_failed",
        level: "error",
        message: `Gateway returned HTTP ${response.status}. Authentication failed.`,
        hint: "Verify the apiKey matches your Gateway key (gw_sk_...).",
      });
    } else {
      checks.push({
        code: "prism_roozylabs_probe_failed",
        level: "error",
        message: `Gateway /v1/models returned HTTP ${response.status}.`,
        hint: "Check that the Gateway is running and the baseUrl is correct.",
      });
    }
  } catch (err) {
    checks.push({
      code: "prism_roozylabs_unreachable",
      level: "error",
      message: "Could not reach the Gateway.",
      detail: errorDetail(err),
      hint: "Check baseUrl and make sure Prism RoozyLabs is running where Paperclip can reach it.",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
