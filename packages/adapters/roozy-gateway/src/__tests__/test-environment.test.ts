import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { testEnvironment } from "../server/test.js";
import type { AdapterEnvironmentTestContext } from "@paperclipai/adapter-utils";

function createTestCtx(
  overrides: Record<string, unknown> = {},
): AdapterEnvironmentTestContext {
  return {
    companyId: "company-001",
    adapterType: "roozy_gateway",
    config: {
      baseUrl: "http://localhost:8080",
      apiKey: "gw_sk_test12345678901234567890123456789012345678",
      model: "roozy-auto",
      ...overrides,
    },
  };
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("testEnvironment", () => {
  it("fails when baseUrl is missing", async () => {
    const ctx = createTestCtx({ baseUrl: "" });
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "roozy_gateway_base_url_missing")).toBe(true);
  });

  it("fails when apiKey is missing", async () => {
    const ctx = createTestCtx({ apiKey: "" });
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "roozy_gateway_api_key_missing")).toBe(true);
  });

  it("warns when apiKey doesn't start with gw_sk_", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "roozy-auto" }] }),
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: "roozy-auto" }] })),
    });

    const ctx = createTestCtx({ apiKey: "sk-not-a-gateway-key" });
    const result = await testEnvironment(ctx);
    expect(result.checks.some((c) => c.code === "roozy_gateway_api_key_prefix_warning")).toBe(true);
  });

  it("passes when gateway is reachable and auth valid", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "roozy-auto" }, { id: "gpt-4o" }] }),
      text: () =>
        Promise.resolve(
          JSON.stringify({ data: [{ id: "roozy-auto" }, { id: "gpt-4o" }] }),
        ),
    });

    const ctx = createTestCtx();
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("pass");
    expect(result.checks.some((c) => c.code === "roozy_gateway_reachable")).toBe(true);
    expect(result.checks.some((c) => c.code === "roozy_gateway_model_available")).toBe(true);
  });

  it("warns when configured model not in static list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "roozy-auto" }] }),
      text: () => Promise.resolve(JSON.stringify({ data: [{ id: "roozy-auto" }] })),
    });

    const ctx = createTestCtx({ model: "custom-model" });
    const result = await testEnvironment(ctx);
    expect(result.checks.some((c) => c.code === "roozy_gateway_model_not_in_static_list")).toBe(true);
    expect(result.status).toBe("warn");
  });

  it("fails when auth returns 401", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: "Unauthorized" } }),
      text: () => Promise.resolve(JSON.stringify({ error: { message: "Unauthorized" } })),
    });

    const ctx = createTestCtx();
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "roozy_gateway_auth_failed")).toBe(true);
  });

  it("fails when gateway is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error("ECONNREFUSED"), { cause: { code: "ECONNREFUSED" } }),
    );

    const ctx = createTestCtx();
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "roozy_gateway_unreachable")).toBe(true);
  });

  it("fails for invalid baseUrl", async () => {
    const ctx = createTestCtx({ baseUrl: "not-a-url" });
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "roozy_gateway_base_url_invalid")).toBe(true);
  });

  it("fails for remote plain HTTP without escape hatch", async () => {
    const ctx = createTestCtx({ baseUrl: "http://example.com:8080" });
    const result = await testEnvironment(ctx);
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "roozy_gateway_plain_http_denied")).toBe(true);
  });

  it("allows loopback HTTP", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    });

    const ctx = createTestCtx({ baseUrl: "http://127.0.0.1:8080" });
    const result = await testEnvironment(ctx);
    expect(result.checks.some((c) => c.code === "roozy_gateway_loopback_http_allowed")).toBe(true);
  });
});
