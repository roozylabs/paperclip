import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SEC,
  DEFAULT_STREAM,
} from "../shared/constants.js";

export function buildRoozyGatewayConfig(
  values: CreateConfigValues,
): Record<string, unknown> {
  const v = values as unknown as Record<string, unknown>;
  const ac: Record<string, unknown> = {};
  ac.baseUrl = v.baseUrl ?? DEFAULT_BASE_URL;
  ac.apiKey = v.apiKey ?? "";
  ac.model = (values.model || DEFAULT_MODEL) as string;
  ac.stream = v.stream ?? DEFAULT_STREAM;
  ac.timeoutSec = v.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  ac.maxTokens = v.maxTokens ?? 0;
  ac.temperature = v.temperature ?? 0;
  ac.promptTemplate = values.promptTemplate || "";
  return ac;
}
