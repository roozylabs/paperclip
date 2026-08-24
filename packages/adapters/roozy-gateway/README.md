# @roozylabs/paperclip-adapter-gateway

Paperclip adapter for the **RoozyLabs AI Gateway** — a centralized OpenAI-compatible LLM gateway with smart routing, credential rotation, retry/fallback, budget control, and multi-provider support.

## Architecture

```
Paperclip Agent
       ↓
roozy_gateway adapter  ← this package
       ↓
Roozy AI Gateway       ← provider selection happens here
       ↓
Claude / GPT / Gemini / OpenRouter / OpenCode / ...
```

**Key principle:** Paperclip selects an agent runtime; Roozy Gateway selects the underlying AI provider/model.

## Phase 1 Scope (current)

This adapter performs **stateless chat completions** through the Gateway:

- Sends one `POST /v1/chat/completions` request per run
- Streams SSE responses when enabled
- Captures usage (input/output tokens), model, provider, and request ID
- Returns the model's text response as the run output

### Not supported in Phase 1

- Tool/function calling execution
- Repository inspection or file editing
- Shell command execution
- Session continuity across runs
- Cost reporting (Gateway tracks cost server-side only)

Use local adapters (`claude_local`, `codex_local`) for coding-agent work that requires tools.

## Installation

### As a workspace package (development)

Already included in the Paperclip monorepo. Install as an external adapter:

```bash
# Via API
curl -X POST http://localhost:3100/api/adapters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"localPath": "/path/to/paperclip/packages/adapters/roozy-gateway"}'
```

### As an npm package (published)

```bash
npm install @roozylabs/paperclip-adapter-gateway
```

Then register via API or `~/.paperclip/adapter-plugins.json`.

## Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baseUrl` | string | `http://localhost:8080` | Gateway URL |
| `apiKey` | string | (required) | Gateway key (`gw_sk_...`) |
| `model` | string | `roozy-auto` | Model slug |
| `stream` | boolean | `true` | Enable streaming |
| `timeoutSec` | number | `600` | Request timeout |
| `maxTokens` | number | `0` | Response token cap (0 = model default) |
| `temperature` | number | `0` | Sampling temperature (0 = model default) |
| `promptTemplate` | string | (default) | Custom system prompt with `{{variable}}` placeholders |

## Model Routing

Use `roozy-auto` for smart routing — the Gateway automatically selects the best provider/model based on task type, complexity, and budget. Or pin to a specific model like `gpt-4o` or `claude-sonnet-4-20250514`.

## Response Headers Captured

The adapter captures these from Gateway responses:

- `X-Request-ID` — for debugging request traces
- `X-Roozy-Model` — actual routed model (may differ from requested)
- `X-Roozy-Provider` — upstream provider type

## Error Handling

| HTTP Status | Error Code | Family | Retry |
|-------------|-----------|--------|-------|
| 401/403 | `roozy_gateway_auth_failed` | — | No |
| 400 | `roozy_gateway_bad_request` | — | No |
| 404 | `roozy_gateway_model_not_found` | — | No |
| 429 | `roozy_gateway_rate_limited` | transient | Yes (Retry-After) |
| 5xx | `roozy_gateway_upstream_error` | transient | No (Gateway retries) |
| Network | `roozy_gateway_connect_failed` | transient | Yes |
| Timeout | `roozy_gateway_timeout` | transient | Yes |

## Testing

```bash
cd packages/adapters/roozy-gateway
pnpm test
```

All tests use mocked `fetch` — no live Gateway required.

## Phase 2 Roadmap

- Local tool loop with configurable toolset (shell, file, git)
- Tool call accumulation and execution
- Session persistence (if Gateway adds conversation support)
- Cost estimate from model pricing
