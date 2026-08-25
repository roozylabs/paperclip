/**
 * Prism RoozyLabs adapter for Paperclip.
 *
 * Connects Paperclip agents to Prism RoozyLabs — a centralized
 * OpenAI-compatible LLM gateway with smart routing (prism-auto), credential
 * rotation, retry/fallback, budget control, and multi-provider support.
 *
 * Architecture:
 *
 *   Paperclip Agent
 *        ↓
 *   roozy_gateway adapter  ← this package
 *        ↓
 *   Prism RoozyLabs        ← provider selection happens here
 *        ↓
 *   Claude / GPT / Gemini / OpenRouter / OpenCode / ...
 *
 * Phase 1 scope: stateless chat completions. Tool execution is not yet
 * supported — see README.md for the Phase 2 roadmap.
 */

import type { ServerAdapterModule } from "@paperclipai/adapter-utils";

import { ADAPTER_TYPE, ADAPTER_LABEL } from "./shared/constants.js";
import {
  createServerAdapter as buildServerAdapter,
} from "./server/index.js";

export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;

export const models: { id: string; label: string }[] = [
  { id: "prism-auto", label: "prism-auto (smart router)" },
  { id: "roozy-auto", label: "roozy-auto (smart router)" },
  { id: "gpt-4o", label: "gpt-4o" },
  { id: "gpt-4o-mini", label: "gpt-4o-mini" },
  { id: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet-20241022" },
  { id: "gemini-1.5-pro", label: "gemini-1.5-pro" },
  { id: "big-pickle", label: "big-pickle (OpenCode)" },
];

export const agentConfigurationDoc = `# Prism RoozyLabs agent configuration

Adapter: roozy_gateway

Use when:
- The agent should run through Prism RoozyLabs for centralized LLM access.
- You want smart model routing via \`prism-auto\` without choosing a specific provider.
- You need centralized credential rotation, budget control, retry/fallback, and observability.
- The task is analysis, writing, review, summarization, or any text-producing work.

Don't use when:
- The agent needs to inspect files, run commands, edit repositories, or call tools.
  This adapter performs stateless LLM calls only in Phase 1.
- You need iterative tool loops or session continuity across runs. The Gateway is stateless;
  each run sends one request with the full task context.

Required fields:
- baseUrl (string): Prism RoozyLabs URL, e.g. https://api.prism.roozylabs.com or http://localhost:8080.
- apiKey (string): Gateway API key (\`gw_sk_prism_...\`). Sent as Authorization Bearer header.

Optional fields:
- model (string): defaults to \`prism-auto\`. Use a specific model slug to pin routing.
- stream (boolean): defaults to true. Stream responses into the run viewer.
- timeoutSec (number): defaults to 600.
- maxTokens (number): optional cap on response tokens.
- temperature (number): optional sampling temperature.
- promptTemplate (string): custom system prompt template using {{variable}} placeholders.

Runtime mapping:
- POSTs to \`{baseUrl}/v1/chat/completions\` with OpenAI-compatible messages.
- Streams SSE chunks when streaming is enabled; captures usage from final chunk.
- Captures \`X-Prism-Model\`, \`X-Prism-Provider\`, \`X-Request-ID\` response headers for debugging.

Security guidance:
- Never put the apiKey into prompts, logs, or comments. The adapter redacts it automatically.
- Prefer HTTPS for non-loopback gateways; plain HTTP remote URLs require an escape hatch.

Phase 1 capability boundary:
This adapter sends one chat-completions request per run and returns the response as the
run output. It does NOT support repository inspection, shell execution, file editing,
or tool calling. Use local adapters (claude_local, codex_local) for coding-agent work.
`;

export function createServerAdapter(): ServerAdapterModule {
  return buildServerAdapter();
}
