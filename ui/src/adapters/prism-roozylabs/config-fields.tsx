import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps, CreateConfigValues } from "../types";
import {
  DraftInput,
  DraftNumberInput,
  Field,
  ToggleField,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_MODEL = "prism-auto";
const DEFAULT_TIMEOUT_SEC = 600;

type SecretRef = {
  type: "secret_ref";
  secretId: string;
  version?: number | "latest";
};

function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "secret_ref" &&
    typeof (value as { secretId?: unknown }).secretId === "string"
  );
}

function readCreateValue(
  values: CreateConfigValues | null,
  key: string,
  fallback: unknown,
): unknown {
  return values?.adapterSchemaValues?.[key] ?? fallback;
}

function writeCreateValue(
  values: CreateConfigValues | null,
  set: ((patch: Partial<CreateConfigValues>) => void) | null,
  key: string,
  value: unknown,
) {
  set?.({
    adapterSchemaValues: {
      ...values?.adapterSchemaValues,
      [key]: value,
    },
  });
}

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
  stored,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  stored?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={stored ? "Stored secret; enter a new value to replace it" : placeholder}
        />
      </div>
    </Field>
  );
}

export function PrismRoozyLabsConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const storedApiKey = config.apiKey;
  const hasStoredApiKey = isSecretRef(storedApiKey) || typeof storedApiKey === "string";
  const editApiKeyValue =
    typeof storedApiKey === "string"
      ? String(eff("adapterConfig", "apiKey", storedApiKey))
      : "";

  const readValue = (key: string, fallback: unknown) =>
    isCreate
      ? readCreateValue(values, key, fallback)
      : eff("adapterConfig", key, (config[key] ?? fallback) as never);

  const writeValue = (key: string, value: unknown) => {
    if (isCreate) {
      writeCreateValue(values, set, key, value);
    } else {
      mark("adapterConfig", key, value);
    }
  };

  const baseUrl = String(readValue("baseUrl", DEFAULT_BASE_URL) ?? DEFAULT_BASE_URL);
  const model = String(readValue("model", DEFAULT_MODEL) ?? DEFAULT_MODEL);
  const stream = Boolean(readValue("stream", true));
  const timeoutSec = Number(readValue("timeoutSec", DEFAULT_TIMEOUT_SEC) ?? DEFAULT_TIMEOUT_SEC);
  const maxTokens = Number(readValue("maxTokens", 0) ?? 0);
  const temperature = Number(readValue("temperature", 0) ?? 0);

  return (
    <>
      <Field
        label="Gateway URL"
        hint="Prism RoozyLabs URL, e.g. https://api.prism.roozylabs.com or http://localhost:8080"
      >
        <DraftInput
          value={baseUrl}
          onCommit={(v) => writeValue("baseUrl", v || undefined)}
          immediate
          className={inputClass}
          placeholder="https://api.prism.roozylabs.com"
        />
      </Field>

      <SecretField
        label="Gateway API key"
        value={
          isCreate
            ? String(readCreateValue(values, "apiKey", "") ?? "")
            : editApiKeyValue
        }
        onCommit={(v) => writeValue("apiKey", v || undefined)}
        placeholder="gw_sk_prism_..."
        stored={!isCreate && hasStoredApiKey && !editApiKeyValue}
      />

      <Field label="Model" hint="Routing model slug. Defaults to prism-auto for smart routing.">
        <DraftInput
          value={model}
          onCommit={(v) => writeValue("model", v || undefined)}
          immediate
          className={inputClass}
          placeholder="prism-auto"
        />
      </Field>

      <ToggleField
        label="Stream responses"
        hint="Stream SSE response chunks in real time."
        checked={stream}
        onChange={(v) => writeValue("stream", v)}
      />

      <Field label="Timeout seconds">
        <DraftNumberInput
          value={Number.isFinite(timeoutSec) ? timeoutSec : DEFAULT_TIMEOUT_SEC}
          onCommit={(v) => writeValue("timeoutSec", v)}
          immediate
          className={inputClass}
        />
      </Field>

      <Field label="Max tokens (optional)" hint="0 for unlimited / model default.">
        <DraftNumberInput
          value={Number.isFinite(maxTokens) ? maxTokens : 0}
          onCommit={(v) => writeValue("maxTokens", v || undefined)}
          immediate
          className={inputClass}
        />
      </Field>

      <Field label="Temperature (optional)" hint="Sampling temperature (e.g. 0.7). 0 for default.">
        <DraftNumberInput
          value={Number.isFinite(temperature) ? temperature : 0}
          onCommit={(v) => writeValue("temperature", v || undefined)}
          immediate
          className={inputClass}
        />
      </Field>
    </>
  );
}
