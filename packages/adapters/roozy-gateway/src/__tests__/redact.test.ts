import { describe, it, expect } from "vitest";
import {
  createTextRedactor,
  redactForLog,
  stringifyForLog,
} from "@paperclipai/adapter-utils/server/redact";

describe("createTextRedactor", () => {
  it("redacts exact secret strings", () => {
    const redact = createTextRedactor(["sk_test_12345", "bearer_token_abc"]);
    expect(redact("value is sk_test_12345")).not.toContain("sk_test_12345");
    expect(redact("value is sk_test_12345")).toContain("[redacted len=15]");
  });

  it("redacts Bearer tokens", () => {
    const redact = createTextRedactor([]);
    expect(redact("Authorization: Bearer sk_xxx")).toContain("Bearer [redacted]");
  });

  it("handles null/undefined secrets gracefully", () => {
    const redact = createTextRedactor([null, undefined, "abc"]);
    expect(redact("abc")).toContain("[redacted len=3]");
  });

  it("truncates long strings", () => {
    const redact = createTextRedactor([]);
    const long = "x".repeat(600);
    const result = redact(long);
    expect(result.length).toBeLessThan(600);
    expect(result).toContain("truncated");
  });
});

describe("redactForLog", () => {
  it("redacts sensitive keys in objects", () => {
    const result = redactForLog(
      { api_key: "secret123", normal: "value" },
      [],
      0,
      (v) => v,
    );
    const record = result as Record<string, unknown>;
    expect(record.api_key).toContain("redacted");
    expect(record.normal).toBe("value");
  });

  it("handles nested objects", () => {
    const result = redactForLog(
      { outer: { authorization: "token123" } },
      [],
      0,
      (v) => v,
    );
    const outer = (result as Record<string, unknown>).outer as Record<string, unknown>;
    expect(outer.authorization).toContain("redacted");
  });

  it("handles arrays", () => {
    const result = redactForLog(["a", "b", "c"], [], 0, (v) => v);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("truncates deep nesting", () => {
    const result = redactForLog({ a: { b: { c: "d" } } }, [], 0, (v) => v);
    expect(result).toBeDefined();
  });

  it("passes through primitives unchanged", () => {
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog(true)).toBe(true);
    expect(redactForLog(null)).toBeNull();
  });
});

describe("stringifyForLog", () => {
  it("returns JSON when under maxChars", () => {
    const result = stringifyForLog({ a: 1 }, 1000);
    expect(result).toBe('{"a":1}');
  });

  it("truncates when over maxChars", () => {
    const result = stringifyForLog({ a: "x".repeat(5000) }, 100);
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(200);
  });
});
