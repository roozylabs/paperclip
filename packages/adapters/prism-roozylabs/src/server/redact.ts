const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(auth|authorization|token|secret|password|api[_-]?key|private[_-]?key)([_-]|$)/i;
const BEARER_TOKEN_PATTERN = /Bearer\s+\S+/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeText(value: string): string {
  return value.replace(BEARER_TOKEN_PATTERN, "Bearer [redacted]");
}

export type TextRedactor = (value: string) => string;

export function createTextRedactor(
  secrets: Array<string | null | undefined>,
): TextRedactor {
  const exactSecrets = [
    ...new Set(
      secrets.filter(
        (s): s is string => typeof s === "string" && s.length >= 4,
      ),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .map((secret) => ({
      secret,
      regex: new RegExp(escapeRegExp(secret), "g"),
    }));

  return (value: string) => {
    let result = sanitizeText(value);
    for (const { secret, regex } of exactSecrets) {
      result = result.replace(regex, `[redacted len=${secret.length}]`);
    }
    return result;
  };
}

export function redactForLog(
  value: unknown,
  keyPath: string[] = [],
  depth = 0,
  redactText: TextRedactor = sanitizeText,
): unknown {
  const key = keyPath[keyPath.length - 1] ?? "";
  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(key))
      return `[redacted len=${value.length}]`;
    const sanitized = redactText(value);
    return sanitized.length > 500
      ? `${sanitized.slice(0, 500)}... [truncated ${sanitized.length - 500} chars]`
      : sanitized;
  }
  if (value == null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) {
    if (depth > 5) return "[array-truncated]";
    return value
      .slice(0, 40)
      .map((entry, i) =>
        redactForLog(entry, [...keyPath, String(i)], depth + 1, redactText),
      );
  }
  if (typeof value === "object") {
    if (depth > 5) return "[object-truncated]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 80)) {
      out[k] = redactForLog(v, [...keyPath, k], depth + 1, redactText);
    }
    return out;
  }
  return redactText(String(value));
}

export function stringifyForLog(
  value: unknown,
  maxChars = 4_000,
): string {
  const text = JSON.stringify(value);
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars)}... [truncated ${text.length - maxChars} chars]`;
}
