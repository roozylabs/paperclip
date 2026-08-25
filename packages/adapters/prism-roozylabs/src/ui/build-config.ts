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
  const ac: Record<string, unknown> = {};
  ac.baseUrl =
    (values as Record<string, unknown>).baseUrl ?? DEFAULT_BASE_URL;
  ac.apiKey = (values as Record<string, unknown>).apiKey ?? "";
  ac.model = values.model || DEFAULT_MODEL;
  ac.stream =
    (values as Record<string, unknown>).stream ?? DEFAULT_STREAM;
  ac.timeoutSec =
    (values as Record<string, unknown>).timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  ac.maxTokens =
    (values as Record<string, unknown>).maxTokens ?? 0;
  ac.temperature =
    (values as Record<string, unknown>).temperature ?? 0;
  ac.promptTemplate = values.promptTemplate || "";
  return ac;
}
