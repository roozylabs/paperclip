import { describe, it, expect } from "vitest";
import { getConfigSchema } from "../server/config-schema.js";

describe("getConfigSchema", () => {
  it("returns a valid schema with required fields", () => {
    const schema = getConfigSchema();
    expect(schema.fields).toBeDefined();
    expect(Array.isArray(schema.fields)).toBe(true);

    const fieldKeys = schema.fields.map((f) => f.key);
    expect(fieldKeys).toContain("baseUrl");
    expect(fieldKeys).toContain("apiKey");
    expect(fieldKeys).toContain("model");
    expect(fieldKeys).toContain("stream");
    expect(fieldKeys).toContain("timeoutSec");
  });

  it("marks baseUrl and apiKey as required", () => {
    const schema = getConfigSchema();
    const baseUrl = schema.fields.find((f) => f.key === "baseUrl");
    const apiKey = schema.fields.find((f) => f.key === "apiKey");
    expect(baseUrl?.required).toBe(true);
    expect(apiKey?.required).toBe(true);
  });

  it("marks apiKey as secret", () => {
    const schema = getConfigSchema();
    const apiKey = schema.fields.find((f) => f.key === "apiKey");
    expect(apiKey?.meta).toEqual({ secret: true });
  });

  it("provides sensible defaults", () => {
    const schema = getConfigSchema();
    const baseUrl = schema.fields.find((f) => f.key === "baseUrl");
    const model = schema.fields.find((f) => f.key === "model");
    expect(baseUrl?.default).toBe("http://localhost:8080");
    expect(model?.default).toBe("roozy-auto");
  });

  it("includes roozy-auto in model options", () => {
    const schema = getConfigSchema();
    const model = schema.fields.find((f) => f.key === "model");
    expect(model?.options?.some((o) => o.value === "roozy-auto")).toBe(true);
  });
});
