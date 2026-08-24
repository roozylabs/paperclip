import { describe, it, expect } from "vitest";
import {
  classifyHttpStatus,
  createGatewayError,
  fetchFailureMessage,
  errorResult,
} from "@paperclipai/adapter-utils/server/errors";

describe("classifyHttpStatus", () => {
  it("returns auth_failed for 401", () => {
    const result = classifyHttpStatus(401);
    expect(result.code).toBe("roozy_gateway_auth_failed");
    expect(result.family).toBeNull();
  });

  it("returns auth_failed for 403", () => {
    const result = classifyHttpStatus(403);
    expect(result.code).toBe("roozy_gateway_auth_failed");
    expect(result.family).toBeNull();
  });

  it("returns model_not_found for 404", () => {
    expect(classifyHttpStatus(404).code).toBe("roozy_gateway_model_not_found");
  });

  it("returns bad_request for 400", () => {
    expect(classifyHttpStatus(400).code).toBe("roozy_gateway_bad_request");
  });

  it("returns rate_limited for 429 with transient family", () => {
    const result = classifyHttpStatus(429);
    expect(result.code).toBe("roozy_gateway_rate_limited");
    expect(result.family).toBe("transient_upstream");
  });

  it("returns upstream_error for 500 with transient family", () => {
    const result = classifyHttpStatus(500);
    expect(result.code).toBe("roozy_gateway_upstream_error");
    expect(result.family).toBe("transient_upstream");
  });

  it("returns upstream_error for 502", () => {
    expect(classifyHttpStatus(502).code).toBe("roozy_gateway_upstream_error");
  });

  it("returns upstream_error for 503", () => {
    expect(classifyHttpStatus(503).code).toBe("roozy_gateway_upstream_error");
  });

  it("returns upstream_error for 504", () => {
    expect(classifyHttpStatus(504).code).toBe("roozy_gateway_upstream_error");
  });
});

describe("createGatewayError", () => {
  it("creates an error with status and code", () => {
    const err = createGatewayError("test error", 429);
    expect(err.message).toBe("test error");
    expect(err.status).toBe(429);
    expect(err.code).toBe("roozy_gateway_rate_limited");
  });

  it("includes body and retryNotBefore", () => {
    const err = createGatewayError("limited", 429, { detail: "too many" }, "30");
    expect(err.body).toEqual({ detail: "too many" });
    expect(err.retryNotBefore).toBe("30");
  });
});

describe("fetchFailureMessage", () => {
  it("extracts message from Error with cause", () => {
    const cause = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
    const err = new Error("fetch failed", { cause });
    expect(fetchFailureMessage(err)).toContain("ECONNREFUSED");
  });

  it("returns plain message for simple Error", () => {
    expect(fetchFailureMessage(new Error("timeout"))).toBe("timeout");
  });

  it("stringifies non-Error values", () => {
    expect(fetchFailureMessage("raw string")).toBe("raw string");
  });
});

describe("errorResult", () => {
  it("returns auth error for 401", () => {
    const err = createGatewayError("Invalid API key", 401);
    const result = errorResult(err, (v) => v);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("roozy_gateway_auth_failed");
    expect(result.errorMessage).toContain("Verify apiKey");
  });

  it("returns transient for 500", () => {
    const err = createGatewayError("internal", 500);
    const result = errorResult(err, (v) => v);
    expect(result.errorFamily).toBe("transient_upstream");
  });

  it("returns transient for connection failure", () => {
    const err = createGatewayError("ECONNREFUSED");
    err.code = "roozy_gateway_connect_failed";
    const result = errorResult(err, (v) => v);
    expect(result.errorFamily).toBe("transient_upstream");
  });

  it("redacts error message", () => {
    const err = createGatewayError("key=sk_test_12345", 401);
    const result = errorResult(err, (v) => v.replace("sk_test_12345", "[REDACTED]"));
    expect(result.errorMessage).not.toContain("sk_test_12345");
  });
});
