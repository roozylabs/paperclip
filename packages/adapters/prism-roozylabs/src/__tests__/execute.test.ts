import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execute } from "../server/execute.js";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";

function createMockCtx(
  overrides: Record<string, unknown> = {},
): AdapterExecutionContext {
  return {
    runId: "run-test-001",
    agent: {
      id: "agent-test-001",
      companyId: "company-test-001",
      name: "Test Agent",
      adapterType: "prism_roozylabs",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {
      baseUrl: "http://localhost:8080",
      apiKey: "gw_sk_prism_test12345678901234567890123456789012345678",
      model: "prism-auto",
      stream: "true",
      timeoutSec: 30,
      ...overrides,
    },
    context: {
      taskId: "task-001",
      taskTitle: "Test task",
      paperclipWake: { kind: "new_assign", description: "Test description" },
    },
    onLog: vi.fn(),
    onMeta: vi.fn(),
  } as unknown as AdapterExecutionContext;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("execute - config validation", () => {
  it("returns error when baseUrl is missing", async () => {
    const ctx = createMockCtx({ baseUrl: "" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_base_url_missing");
  });

  it("returns error when baseUrl is invalid", async () => {
    const ctx = createMockCtx({ baseUrl: "not-a-url" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_base_url_invalid");
  });

  it("returns error when apiKey is missing", async () => {
    const ctx = createMockCtx({ apiKey: "" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_api_key_missing");
  });

  it("returns error for remote plain HTTP without escape hatch", async () => {
    const ctx = createMockCtx({ baseUrl: "http://example.com:8080" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_plain_http_denied");
  });

  it("allows loopback HTTP", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([
        ["X-Roozy-Model", "roozy-auto"],
        ["X-Roozy-Provider", "anthropic"],
        ["X-Request-ID", "req-001"],
      ]),
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(
                'data: {"id":"1","choices":[{"delta":{"content":"hi"}}]}\n\n',
              ),
              done: false,
            })
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(
                'data: {"id":"1","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
              ),
              done: false,
            })
            .mockResolvedValueOnce({
              value: new TextEncoder().encode("data: [DONE]\n\n"),
              done: false,
            })
            .mockResolvedValue({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    } as unknown as Response);

    const ctx = createMockCtx({ baseUrl: "http://localhost:8080" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(result.model).toBe("roozy-auto");
    expect(result.provider).toBe("anthropic");
  });
});

describe("execute - non-streaming response", () => {
  it("parses a successful non-streaming response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([
        ["X-Roozy-Model", "gpt-4o"],
        ["X-Roozy-Provider", "openai"],
        ["X-Request-ID", "req-002"],
      ]),
      json: () =>
        Promise.resolve({
          id: "chatcmpl-001",
          model: "gpt-4o",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello!" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: "chatcmpl-001",
            model: "gpt-4o",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Hello!" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        ),
    } as unknown as Response);

    const ctx = createMockCtx({ stream: "false" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Hello!");
    expect(result.model).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(result.resultJson).toMatchObject({
      request_id: "req-002",
      model: "gpt-4o",
      provider: "openai",
    });
  });
});

describe("execute - streaming response", () => {
  it("streams content deltas and returns final result", async () => {
    const onLog = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([
        ["X-Roozy-Model", "claude-sonnet-4-20250514"],
        ["X-Roozy-Provider", "anthropic"],
        ["X-Request-ID", "req-003"],
      ]),
      body: {
        getReader: () => {
          let callCount = 0;
          return {
            read: vi.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 1)
                return {
                  value: new TextEncoder().encode(
                    'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
                  ),
                  done: false,
                };
              if (callCount === 2)
                return {
                  value: new TextEncoder().encode(
                    'data: {"id":"1","choices":[{"delta":{"content":" world"}}]}\n\n',
                  ),
                  done: false,
                };
              if (callCount === 3)
                return {
                  value: new TextEncoder().encode(
                    'data: {"id":"1","usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}}\n\n',
                  ),
                  done: false,
                };
              if (callCount === 4)
                return {
                  value: new TextEncoder().encode("data: [DONE]\n\n"),
                  done: false,
                };
              return { done: true };
            }),
            releaseLock: vi.fn(),
          };
        },
      },
    } as unknown as Response);

    const ctx = createMockCtx({ stream: "true" });
    ctx.onLog = onLog;
    const result = await execute(ctx);

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Hello world");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.provider).toBe("anthropic");
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });

    // Verify onLog was called with stdout chunks
    const stdoutCalls = onLog.mock.calls.filter(
      (call: unknown[]) => call[0] === "stdout",
    );
    expect(stdoutCalls.length).toBeGreaterThan(0);
  });
});

describe("execute - error handling", () => {
  it("maps 401 to auth error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Map(),
      json: () =>
        Promise.resolve({ error: { message: "Invalid API key", type: "auth" } }),
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: { message: "Invalid API key", type: "auth" } }),
        ),
    } as unknown as Response);

    const ctx = createMockCtx();
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_auth_failed");
    expect(result.errorMessage).toContain("Invalid API key");
  });

  it("maps 429 to rate limited with transient family", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Map([["Retry-After", "30"]]),
      json: () =>
        Promise.resolve({
          error: { message: "Rate limit exceeded", type: "rate_limit_error" },
        }),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: { message: "Rate limit exceeded", type: "rate_limit_error" },
          }),
        ),
    } as unknown as Response);

    const ctx = createMockCtx();
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_rate_limited");
    expect(result.errorFamily).toBe("transient_upstream");
    expect(result.retryNotBefore).toBe("30");
  });

  it("maps 500 to upstream error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Map(),
      json: () => Promise.resolve({ error: { message: "Internal error" } }),
      text: () =>
        Promise.resolve(JSON.stringify({ error: { message: "Internal error" } })),
    } as unknown as Response);

    const ctx = createMockCtx();
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorFamily).toBe("transient_upstream");
  });

  it("handles network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("fetch failed"), {
        cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" },
      }),
    );

    const ctx = createMockCtx();
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("prism_roozylabs_connect_failed");
    expect(result.errorFamily).toBe("transient_upstream");
  });

  it("handles timeout", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      }),
    );

    const ctx = createMockCtx({ timeoutSec: 5 });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(true);
    expect(result.errorCode).toBe("prism_roozylabs_timeout");
  });
});

describe("execute - tool calls detection", () => {
  it("detects tool calls and sets error code", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([
        ["X-Roozy-Model", "gpt-4o"],
        ["X-Roozy-Provider", "openai"],
        ["X-Request-ID", "req-tc"],
      ]),
      json: () =>
        Promise.resolve({
          id: "chatcmpl-tc",
          model: "gpt-4o",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "read_file", arguments: "{}" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        }),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: "chatcmpl-tc",
            model: "gpt-4o",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "read_file", arguments: "{}" },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
          }),
        ),
    } as unknown as Response);

    const ctx = createMockCtx({ stream: "false" });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(result.errorCode).toBe("prism_roozylabs_tool_calls_unsupported");
    expect(result.resultJson).toMatchObject({ has_tool_calls: true });
  });
});

describe("execute - request body", () => {
  it("sends correct Authorization header", async () => {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        headers: new Map([
          ["X-Roozy-Model", "roozy-auto"],
          ["X-Roozy-Provider", "anthropic"],
          ["X-Request-ID", "req-auth"],
        ]),
        json: () =>
          Promise.resolve({
            choices: [{ index: 0, message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ index: 0, message: { content: "ok" } }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
          ),
      } as unknown as Response;
    });

    const ctx = createMockCtx({ stream: "false" });
    await execute(ctx);

    expect(capturedInit?.headers).toMatchObject({
      Authorization: "Bearer gw_sk_prism_test12345678901234567890123456789012345678",
      "Content-Type": "application/json",
    });
  });

  it("includes stream_options when streaming", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        ok: true,
        headers: new Map([
          ["X-Prism-Model", "prism-auto"],
          ["X-Request-ID", "req-stream"],
        ]),
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ value: new TextEncoder().encode("data: [DONE]\n\n"), done: false })
              .mockResolvedValue({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      } as unknown as Response;
    });

    const ctx = createMockCtx({ stream: "true" });
    await execute(ctx);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.stream).toBe(true);
    expect(parsed.stream_options).toEqual({ include_usage: true });
    expect(parsed.model).toBe("prism-auto");
  });
});
