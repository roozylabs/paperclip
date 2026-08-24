import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  UsageSummary,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  renderPaperclipWakePrompt,
  selectPaperclipTaskMarkdown,
  stringifyPaperclipWakePayload,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SEC,
} from "../shared/constants.js";
import {
  allowsInsecureRemoteHttp,
  isRemotePlainHttp,
  remotePlainHttpDeniedMessage,
} from "./transport-security.js";
import {
  createTextRedactor,
  redactForLog,
  stringifyForLog,
  type TextRedactor,
} from "./redact.js";
import {
  classifyHttpStatus,
  createGatewayError,
  fetchFailureMessage,
  errorResult,
  type GatewayHttpError,
} from "./errors.js";
import { parseSseFrames, parseStreamChunk, isDoneSentinel } from "./sse.js";

interface ProviderResponseMessage {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
}

interface ProviderChoice {
  index: number;
  message?: ProviderResponseMessage;
  delta?: { role?: string; content?: string; tool_calls?: unknown[] };
  finish_reason?: string | null;
}

interface ProviderResponse {
  id?: string;
  model?: string;
  choices?: ProviderChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message: string; type?: string; code?: string };
}

const CRITICAL_HEADERS = new Set(["authorization", "content-type"]);

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeBaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function apiUrl(baseUrl: URL, path: string): string {
  let base = baseUrl.toString().replace(/\/+$/, "");
  if (path.startsWith("/v1/") && base.endsWith("/v1")) {
    base = base.slice(0, -3);
  }
  return `${base}${path}`;
}

function readResponseJson(response: Response): Promise<unknown> {
  return response.text().then((text) => {
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  });
}

function buildInput(ctx: AdapterExecutionContext): string {
  const taskMarkdown = nonEmpty(selectPaperclipTaskMarkdown(ctx.context));
  const wakePrompt = renderPaperclipWakePrompt(ctx.context.paperclipWake);
  const wakePayloadJson = stringifyPaperclipWakePayload(
    ctx.context.paperclipWake,
  );
  const lines = [
    `You are ${ctx.agent.name}, an AI agent employee in a Paperclip-managed company.`,
    "",
    "Paperclip runtime identity:",
    `- Agent ID: ${ctx.agent.id}`,
    `- Company ID: ${ctx.agent.companyId}`,
    `- Run ID: ${ctx.runId}`,
    "",
    "Execution contract:",
    "- Take concrete action in this run when the task is actionable.",
    "- Do not stop at a plan unless the issue asks for planning only.",
    "- Leave durable progress and update the issue to a clear final disposition.",
    "",
    wakePrompt,
    ...(taskMarkdown ? ["", taskMarkdown] : []),
    ...(wakePayloadJson
      ? [
          "",
          "Structured wake payload JSON:",
          "```json",
          wakePayloadJson,
          "```",
        ]
      : []),
  ];
  return lines.filter((l) => l != null).join("\n").trim();
}

function buildMessages(
  ctx: AdapterExecutionContext,
): Array<{ role: string; content: string }> {
  const template = asString(ctx.config.promptTemplate, "");
  const systemPrompt = template
    ? template
        .replace(/\{\{agentId\}\}/g, ctx.agent.id)
        .replace(/\{\{agentName\}\}/g, ctx.agent.name)
        .replace(/\{\{companyId\}\}/g, ctx.agent.companyId)
        .replace(/\{\{runId\}\}/g, ctx.runId)
        .replace(/\{\{taskId\}\}/g, asString(ctx.context.taskId, ""))
        .replace(
          /\{\{taskTitle\}\}/g,
          asString(ctx.context.taskTitle, ""),
        )
    : [
        `You are ${ctx.agent.name}, an AI agent employee in a Paperclip-managed company.`,
        "",
        `Agent ID: ${ctx.agent.id}`,
        `Company ID: ${ctx.agent.companyId}`,
        `Run ID: ${ctx.runId}`,
        "",
        "Produce your complete response as the final answer in this message.",
      ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildInput(ctx) },
  ];
}

function buildRequestBody(
  ctx: AdapterExecutionContext,
  model: string,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(ctx),
    stream,
  };
  if (stream) {
    body.stream_options = { include_usage: true };
  }
  const maxTokens = parseNonNegativeNumber(ctx.config.maxTokens, 0);
  if (maxTokens > 0) body.max_tokens = maxTokens;
  const temperature = parseNonNegativeNumber(ctx.config.temperature, 0);
  if (temperature > 0) body.temperature = temperature;
  return body;
}

function extractUsage(chunk: ProviderResponse): UsageSummary | undefined {
  const usage = chunk.usage;
  if (!usage) return undefined;
  const inputTokens = asNumber(
    usage.prompt_tokens ?? (usage as Record<string, unknown>).prompt_tokens,
    0,
  );
  const outputTokens = asNumber(
    usage.completion_tokens ??
      (usage as Record<string, unknown>).completion_tokens,
    0,
  );
  if (inputTokens <= 0 && outputTokens <= 0) return undefined;
  return { inputTokens, outputTokens };
}

function extractTextFromChoice(
  choice: ProviderChoice,
): string | null {
  const msg = choice.message ?? choice.delta;
  if (!msg) return null;
  if (typeof msg.content === "string") return msg.content;
  return null;
}

async function handleStreamingResponse(
  response: Response,
  ctx: AdapterExecutionContext,
  redactText: TextRedactor,
): Promise<{
  text: string;
  usage: UsageSummary | undefined;
  model: string | null;
  provider: string | null;
  requestId: string | null;
  hasToolCalls: boolean;
  finishReason: string | null;
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw createGatewayError(
      "Gateway streaming response had no body",
      response.status,
    );
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: UsageSummary | undefined;
  let hasToolCalls = false;
  let finishReason: string | null = null;
  const model =
    response.headers.get("X-Roozy-Model") ?? null;
  const provider =
    response.headers.get("X-Roozy-Provider") ?? null;
  const requestId =
    response.headers.get("X-Request-ID") ?? null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.trim().length > 0) {
          const { frames } = parseSseFrames(`${buffer}\n\n`);
          for (const frame of frames) {
            processFrame(frame.data);
          }
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = parseSseFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        processFrame(frame.data);
      }
    }
  } finally {
    reader.releaseLock();
  }

  function processFrame(data: string): void {
    if (isDoneSentinel(data)) return;
    const chunk = parseStreamChunk(data);
    if (!chunk) return;

    if (chunk.error) {
      ctx.onLog(
        "stderr",
        `[roozy-gateway] upstream error: ${chunk.error.message}\n`,
      );
      return;
    }

    const chunkUsage = extractUsage(chunk);
    if (chunkUsage) usage = chunkUsage;

    if (chunk.choices && chunk.choices.length > 0) {
      for (const choice of chunk.choices) {
        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          ctx.onLog("stdout", delta.content);
        }
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          hasToolCalls = true;
          ctx.onLog(
            "stdout",
            `\n[roozy-gateway] tool_calls detected (unsupported in Phase 1): ${stringifyForLog(delta.tool_calls, 1_000)}\n`,
          );
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }
  }

  return {
    text,
    usage,
    model,
    provider,
    requestId,
    hasToolCalls,
    finishReason,
  };
}

async function handleNonStreamingResponse(
  response: Response,
  ctx: AdapterExecutionContext,
  redactText: TextRedactor,
): Promise<{
  parsed: ProviderResponse;
  usage: UsageSummary | undefined;
  model: string | null;
  provider: string | null;
  requestId: string | null;
  text: string;
  hasToolCalls: boolean;
}> {
  const body = (await readResponseJson(response)) as ProviderResponse;
  if (!body) {
    throw createGatewayError(
      "Gateway returned empty response",
      response.status,
    );
  }
  if (body.error) {
    throw createGatewayError(
      body.error.message,
      response.status ?? 502,
      body.error,
    );
  }

  const choice = body.choices?.[0];
  const text = choice ? extractTextFromChoice(choice) ?? "" : "";
  const hasToolCalls = Boolean(
    choice?.message?.tool_calls && choice.message.tool_calls.length > 0,
  );
  const usage = extractUsage(body);
  const model =
    response.headers.get("X-Roozy-Model") ?? body.model ?? null;
  const provider =
    response.headers.get("X-Roozy-Provider") ?? null;
  const requestId =
    response.headers.get("X-Request-ID") ?? null;

  return {
    parsed: body,
    usage,
    model,
    provider,
    requestId,
    text,
    hasToolCalls,
  };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { config, onLog, onMeta, agent, runId } = ctx;

  const baseUrlRaw =
    typeof config.baseUrl === "string"
      ? config.baseUrl.trim()
      : DEFAULT_BASE_URL;
  if (!baseUrlRaw) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "roozy_gateway_base_url_missing",
      errorMessage: "Roozy AI Gateway adapter requires a baseUrl.",
    };
  }
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  if (!baseUrl) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "roozy_gateway_base_url_invalid",
      errorMessage: `Invalid Gateway baseUrl: ${baseUrlRaw}`,
    };
  }
  if (isRemotePlainHttp(baseUrl) && !allowsInsecureRemoteHttp(config)) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "roozy_gateway_plain_http_denied",
      errorMessage: remotePlainHttpDeniedMessage(baseUrl.hostname),
    };
  }

  const apiKey = nonEmpty(config.apiKey);
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "roozy_gateway_api_key_missing",
      errorMessage: "Roozy AI Gateway adapter requires an apiKey (gw_sk_...).",
    };
  }

  const model = asString(config.model, DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const stream = asString(config.stream, "true") !== "false";
  const timeoutSec = parseNonNegativeNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const timeoutMs = timeoutSec > 0 ? Math.ceil(timeoutSec * 1000) : 0;

  const redactText = createTextRedactor([apiKey]);
  const chatUrl = apiUrl(baseUrl, "/v1/chat/completions");

  await onMeta?.({
    adapterType: "roozy_gateway",
    command: "POST /v1/chat/completions",
    commandArgs: [chatUrl],
    context: {
      runId,
      model,
      stream,
      timeoutSec,
      baseUrl: baseUrl.toString(),
    },
  });
  await onLog(
    "stdout",
    `[roozy-gateway] connecting to ${redactText(baseUrl.toString())} (model=${model}, stream=${stream})\n`,
  );

  const body = buildRequestBody(ctx, model, stream);
  const controller = new AbortController();
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs > 0) {
    timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    let response: Response;
    try {
      response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Accept: stream ? "text/event-stream" : "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError")
      ) {
        return {
          exitCode: 1,
          signal: null,
          timedOut: true,
          errorCode: "roozy_gateway_timeout",
          errorMessage: `Gateway request timed out after ${timeoutSec}s.`,
          provider: "roozy_gateway",
          model,
          resultJson: { url: chatUrl, model, stream },
        };
      }
      const gwErr = createGatewayError(
        `Gateway request failed: ${fetchFailureMessage(err)}`,
        undefined,
        undefined,
      );
      gwErr.code = "roozy_gateway_connect_failed";
      return errorResult(
        gwErr,
        redactText,
      );
    }

    if (!response.ok) {
      const errBody = await readResponseJson(response);
      const classified = classifyHttpStatus(response.status);
      const errRecord = errBody as Record<string, unknown> | null;
      const nestedError = errRecord?.error as
        | Record<string, unknown>
        | undefined;
      const errorMessage =
        (typeof nestedError?.message === "string"
          ? nestedError.message
          : typeof errRecord?.message === "string"
            ? errRecord.message
            : null) ?? `Gateway returned HTTP ${response.status}`;
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: classified.code,
        errorFamily: classified.family,
        retryNotBefore: response.headers.get("Retry-After"),
        errorMessage: redactText(errorMessage),
        provider: "roozy_gateway",
        model,
        resultJson: {
          url: chatUrl,
          status: response.status,
          error: redactForLog(errBody, [], 0, redactText),
        },
      };
    }

    await onLog(
      "stdout",
      `[roozy-gateway:request] POST /v1/chat/completions model=${model}\n`,
    );

    if (stream) {
      const result = await handleStreamingResponse(
        response,
        ctx,
        redactText,
      );
      const gatewayModel = result.model;
      const gatewayProvider = result.provider;
      const requestId = result.requestId;

      if (requestId) {
        await onLog(
          "stdout",
          `[roozy-gateway:response] model=${gatewayModel ?? model} provider=${gatewayProvider ?? "unknown"} request_id=${requestId}\n`,
        );
      }

      let exitCode = 0;
      let errorMessage: string | null = null;
      let errorCode: string | null = null;

      if (result.hasToolCalls) {
        exitCode = 0;
        errorMessage =
          "Tool calls returned by the model. Tool execution is not supported in Phase 1 (stateless LLM adapter).";
        errorCode = "roozy_gateway_tool_calls_unsupported";
      }

      await onLog(
        "stdout",
        `\n[roozy-gateway:result] exit=${exitCode} tokens_in=${result.usage?.inputTokens ?? 0} tokens_out=${result.usage?.outputTokens ?? 0}\n`,
      );

      return {
        exitCode,
        signal: null,
        timedOut: false,
        ...(errorMessage ? { errorMessage } : {}),
        ...(errorCode ? { errorCode } : {}),
        usage: result.usage,
        provider: gatewayProvider ?? "roozy_gateway",
        model: gatewayModel ?? model,
        summary: result.text.slice(0, 2_000) || null,
        resultJson: {
          request_id: requestId,
          model: gatewayModel ?? model,
          provider: gatewayProvider,
          finish_reason: result.finishReason,
          usage: result.usage ?? null,
          has_tool_calls: result.hasToolCalls,
        },
      };
    }

    const result = await handleNonStreamingResponse(
      response,
      ctx,
      redactText,
    );
    const gatewayModel = result.model;
    const gatewayProvider = result.provider;
    const requestId = result.requestId;

    if (requestId) {
      await onLog(
        "stdout",
        `[roozy-gateway:response] model=${gatewayModel ?? model} provider=${gatewayProvider ?? "unknown"} request_id=${requestId}\n`,
      );
    }

    let exitCode = 0;
    let errorMessage: string | null = null;
    let errorCode: string | null = null;

    if (result.hasToolCalls) {
      errorMessage =
        "Tool calls returned by the model. Tool execution is not supported in Phase 1 (stateless LLM adapter).";
      errorCode = "roozy_gateway_tool_calls_unsupported";
    }

    await onLog(
      "stdout",
      `\n[roozy-gateway:result] exit=${exitCode} tokens_in=${result.usage?.inputTokens ?? 0} tokens_out=${result.usage?.outputTokens ?? 0}\n`,
    );

    return {
      exitCode,
      signal: null,
      timedOut: false,
      ...(errorMessage ? { errorMessage } : {}),
      ...(errorCode ? { errorCode } : {}),
      usage: result.usage,
      provider: gatewayProvider ?? "roozy_gateway",
      model: gatewayModel ?? model,
      summary: result.text.slice(0, 2_000) || null,
      resultJson: {
        request_id: requestId,
        model: gatewayModel ?? model,
        provider: gatewayProvider,
        finish_reason: result.parsed.choices?.[0]?.finish_reason ?? null,
        usage: result.usage ?? null,
        has_tool_calls: result.hasToolCalls,
      },
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}
