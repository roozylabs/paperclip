import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function stripAnsi(text: string): string {
  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parsePrismRoozyLabsStdoutLine(
  line: string,
  ts: string,
): TranscriptEntry[] {
  const cleaned = stripAnsi(line);
  const trimmed = cleaned.trim();
  if (!trimmed) return [];

  const responseMatch = trimmed.match(
    /^\[(?:roozy-gateway|prism-roozylabs|prism-gateway):response\]\s+model=(\S+)\s+provider=(\S+)\s+request_id=(\S+)$/,
  );
  if (responseMatch) {
    return [
      {
        kind: "init",
        ts,
        model: responseMatch[1],
        sessionId: responseMatch[3],
      },
    ];
  }

  const resultMatch = trimmed.match(
    /^\[(?:roozy-gateway|prism-roozylabs|prism-gateway):result\]\s+exit=(\d+)\s+tokens_in=(\d+)\s+tokens_out=(\d+)$/,
  );
  if (resultMatch) {
    return [
      {
        kind: "result",
        ts,
        text: "",
        inputTokens: Number.parseInt(resultMatch[2], 10) || 0,
        outputTokens: Number.parseInt(resultMatch[3], 10) || 0,
        cachedTokens: 0,
        costUsd: 0,
        subtype: resultMatch[1] === "0" ? "success" : "error",
        isError: resultMatch[1] !== "0",
        errors: [],
      },
    ];
  }

  const requestMatch = trimmed.match(
    /^\[(?:roozy-gateway|prism-roozylabs|prism-gateway):request\]\s+POST\s+(\S+)\s+model=(\S+)$/,
  );
  if (requestMatch) {
    return [
      {
        kind: "system",
        ts,
        text: `Request: ${requestMatch[1]} (model=${requestMatch[2]})`,
      },
    ];
  }

  const toolCallsMatch = trimmed.match(
    /^\[(?:roozy-gateway|prism-roozylabs|prism-gateway)\]\s+tool_calls detected.*$/s,
  );
  if (toolCallsMatch) {
    return [
      {
        kind: "system",
        ts,
        text: "Tool calls returned but not executed (Phase 1)",
      },
    ];
  }

  if (
    trimmed.startsWith("[roozy-gateway]") ||
    trimmed.startsWith("[prism-roozylabs]") ||
    trimmed.startsWith("[prism-gateway]")
  ) {
    const inner = trimmed.replace(/^\[(?:roozy-gateway|prism-roozylabs|prism-gateway)\]\s*/, "");
    return [{ kind: "system", ts, text: inner }];
  }

  return [{ kind: "stdout", ts, text: cleaned }];
}
