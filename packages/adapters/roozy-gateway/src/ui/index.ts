import type { TranscriptEntry } from "@paperclipai/adapter-utils";
import { parseRoozyGatewayStdoutLine } from "./parse-stdout.js";
import { buildRoozyGatewayConfig } from "./build-config.js";

export const roozyGatewayUIAdapter = {
  type: "roozy_gateway" as const,
  label: "Roozy AI Gateway",
  parseStdoutLine: parseRoozyGatewayStdoutLine,
  buildAdapterConfig: buildRoozyGatewayConfig,
};

export { parseRoozyGatewayStdoutLine, buildRoozyGatewayConfig };

export type { TranscriptEntry };
