import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SEC,
  DEFAULT_STREAM,
} from "../shared/constants.js";

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "baseUrl",
        label: "Gateway URL",
        type: "text",
        required: true,
        default: DEFAULT_BASE_URL,
        hint: "Roozy AI Gateway base URL, e.g. http://localhost:8080 or https://gateway.example.com",
      },
      {
        key: "apiKey",
        label: "Gateway API Key",
        type: "text",
        required: true,
        hint: "Roozy AI Gateway key (gw_sk_...). Stored as a secret.",
        meta: { secret: true },
      },
      {
        key: "model",
        label: "Model",
        type: "combobox",
        default: DEFAULT_MODEL,
        hint: "Model slug. Use roozy-auto for smart routing, or a specific model like gpt-4o or claude-sonnet-4-20250514.",
        options: [
          { value: "roozy-auto", label: "roozy-auto (smart router)" },
          { value: "gpt-4o", label: "gpt-4o" },
          { value: "gpt-4o-mini", label: "gpt-4o-mini" },
          {
            value: "claude-3-5-sonnet-20241022",
            label: "claude-3-5-sonnet-20241022",
          },
          { value: "gemini-1.5-pro", label: "gemini-1.5-pro" },
          { value: "big-pickle", label: "big-pickle (OpenCode)" },
        ],
      },
      {
        key: "stream",
        label: "Streaming",
        type: "toggle",
        default: DEFAULT_STREAM,
        hint: "Stream responses for real-time output in the run viewer.",
      },
      {
        key: "timeoutSec",
        label: "Timeout (seconds)",
        type: "number",
        default: DEFAULT_TIMEOUT_SEC,
        hint: "Maximum time in seconds to wait for the Gateway response.",
      },
      {
        key: "maxTokens",
        label: "Max tokens",
        type: "number",
        default: 0,
        hint: "Maximum tokens in the response. 0 = model default.",
      },
      {
        key: "temperature",
        label: "Temperature",
        type: "number",
        default: 0,
        hint: "Sampling temperature (0 = model default).",
      },
      {
        key: "promptTemplate",
        label: "Prompt template",
        type: "textarea",
        hint: "Custom system prompt template. Uses {{variable}} placeholders (agentId, agentName, runId, etc.). Leave empty for the default Paperclip agent prompt.",
      },
    ],
  };
}
