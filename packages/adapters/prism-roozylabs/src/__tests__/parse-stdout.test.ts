import { describe, it, expect } from "vitest";
import { parseRoozyGatewayStdoutLine } from "../ui/parse-stdout.js";

describe("parseRoozyGatewayStdoutLine", () => {
  const ts = "2025-01-01T00:00:00.000Z";

  it("parses [roozy-gateway:response] into init entry", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "[roozy-gateway:response] model=claude-sonnet-4-20250514 provider=anthropic request_id=abc-123",
      ts,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("init");
    if (entries[0].kind === "init") {
      expect(entries[0].model).toBe("claude-sonnet-4-20250514");
      expect(entries[0].sessionId).toBe("abc-123");
    }
  });

  it("parses [roozy-gateway:result] into result entry", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "[roozy-gateway:result] exit=0 tokens_in=100 tokens_out=50",
      ts,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("result");
    if (entries[0].kind === "result") {
      expect(entries[0].inputTokens).toBe(100);
      expect(entries[0].outputTokens).toBe(50);
      expect(entries[0].isError).toBe(false);
    }
  });

  it("parses error result with exit=1", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "[roozy-gateway:result] exit=1 tokens_in=0 tokens_out=0",
      ts,
    );
    expect(entries[0].kind).toBe("result");
    if (entries[0].kind === "result") {
      expect(entries[0].isError).toBe(true);
      expect(entries[0].subtype).toBe("error");
    }
  });

  it("parses [roozy-gateway:request] into system entry", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "[roozy-gateway:request] POST /v1/chat/completions model=roozy-auto",
      ts,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("system");
  });

  it("parses [roozy-gateway] connecting line into system", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "[roozy-gateway] connecting to http://localhost:8080 (model=roozy-auto, stream=true)",
      ts,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("system");
  });

  it("parses tool_calls warning into system entry", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "[roozy-gateway] tool_calls detected (unsupported in Phase 1): []",
      ts,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("system");
  });

  it("passes through plain text as stdout", () => {
    const entries = parseRoozyGatewayStdoutLine("Hello, world!", ts);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("stdout");
  });

  it("returns empty array for empty input", () => {
    expect(parseRoozyGatewayStdoutLine("", ts)).toEqual([]);
    expect(parseRoozyGatewayStdoutLine("   ", ts)).toEqual([]);
  });

  it("strips ANSI escape sequences", () => {
    const entries = parseRoozyGatewayStdoutLine(
      "\u001B[32m[some color]\u001B[0m normal text",
      ts,
    );
    expect(entries).toHaveLength(1);
    if (entries[0].kind === "stdout") {
      expect(entries[0].text).not.toContain("\u001B");
    }
  });
});
