/**
 * Self-contained UI transcript parser for the Prism RoozyLabs adapter.
 * Zero imports — runs in a browser sandbox via URL.createObjectURL + dynamic import().
 *
 * Contract version: 1.0.0
 */

function stripAnsi(text: string) {
  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

export function parseStdoutLine(line: string, ts: string): Array<Record<string, unknown>> {
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
        inputTokens: parseInt(resultMatch[2], 10) || 0,
        outputTokens: parseInt(resultMatch[3], 10) || 0,
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
        text: "Request: " + requestMatch[1] + " (model=" + requestMatch[2] + ")",
      },
    ];
  }

  if (
    trimmed.startsWith("[roozy-gateway]") ||
    trimmed.startsWith("[prism-roozylabs]") ||
    trimmed.startsWith("[prism-gateway]")
  ) {
    var inner = trimmed.replace(/^\[(?:roozy-gateway|prism-roozylabs|prism-gateway)\]\s*/, "");
    return [{ kind: "system", ts: ts, text: inner }];
  }

  return [{ kind: "stdout", ts: ts, text: cleaned }];
}
