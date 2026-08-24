import { describe, it, expect } from "vitest";
import { parseSseFrames, parseStreamChunk, isDoneSentinel } from "../server/sse.js";

describe("parseSseFrames", () => {
  it("parses a single data frame", () => {
    const { frames, rest } = parseSseFrames('data: {"id":"1"}\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe('{"id":"1"}');
    expect(frames[0].event).toBeNull();
    expect(rest).toBe("");
  });

  it("parses multiple frames", () => {
    const input = 'data: {"a":1}\n\ndata: {"b":2}\n\n';
    const { frames } = parseSseFrames(input);
    expect(frames).toHaveLength(2);
    expect(frames[0].data).toBe('{"a":1}');
    expect(frames[1].data).toBe('{"b":2}');
  });

  it("handles event: lines", () => {
    const input = "event: message_delta\ndata: {\"text\":\"hi\"}\n\n";
    const { frames } = parseSseFrames(input);
    expect(frames[0].event).toBe("message_delta");
  });

  it("handles comment lines (:) by skipping them", () => {
    const input = ": comment\ndata: {\"ok\":true}\n\n";
    const { frames } = parseSseFrames(input);
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe('{"ok":true}');
  });

  it("handles CRLF line endings", () => {
    const input = "data: {\"x\":1}\r\n\r\n";
    const { frames } = parseSseFrames(input);
    expect(frames).toHaveLength(1);
  });

  it("returns rest for incomplete frame", () => {
    const { frames, rest } = parseSseFrames("data: partial");
    expect(frames).toHaveLength(0);
    expect(rest).toBe("data: partial");
  });

  it("handles empty input", () => {
    const { frames, rest } = parseSseFrames("");
    expect(frames).toHaveLength(0);
    expect(rest).toBe("");
  });

  it("handles multi-line data fields", () => {
    const input = "data: line1\ndata: line2\n\n";
    const { frames } = parseSseFrames(input);
    expect(frames[0].data).toBe("line1\nline2");
  });
});

describe("parseStreamChunk", () => {
  it("parses a valid JSON chunk", () => {
    const chunk = parseStreamChunk('{"id":"1","choices":[{"delta":{"content":"hi"}}]}');
    expect(chunk).not.toBeNull();
    expect(chunk?.id).toBe("1");
    expect(chunk?.choices?.[0]?.delta?.content).toBe("hi");
  });

  it("returns null for [DONE]", () => {
    expect(parseStreamChunk("[DONE]")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseStreamChunk("not json")).toBeNull();
  });

  it("parses usage chunk", () => {
    const chunk = parseStreamChunk('{"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}');
    expect(chunk?.usage?.prompt_tokens).toBe(10);
    expect(chunk?.usage?.completion_tokens).toBe(5);
  });

  it("parses error chunk", () => {
    const chunk = parseStreamChunk('{"error":{"message":"rate limited","type":"rate_limit_error"}}');
    expect(chunk?.error?.message).toBe("rate limited");
  });
});

describe("isDoneSentinel", () => {
  it("returns true for [DONE]", () => {
    expect(isDoneSentinel("[DONE]")).toBe(true);
  });

  it("returns false for other strings", () => {
    expect(isDoneSentinel("data")).toBe(false);
    expect(isDoneSentinel("[done]")).toBe(false);
  });
});
