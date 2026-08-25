import type { TranscriptEntry } from "@paperclipai/adapter-utils";
import { parsePrismRoozyLabsStdoutLine } from "./parse-stdout.js";
import { buildPrismRoozyLabsConfig } from "./build-config.js";

export const prismRoozyLabsUIAdapter = {
  type: "prism_roozylabs" as const,
  label: "Prism RoozyLabs",
  parseStdoutLine: parsePrismRoozyLabsStdoutLine,
  buildAdapterConfig: buildPrismRoozyLabsConfig,
};

export {
  parsePrismRoozyLabsStdoutLine,
  buildPrismRoozyLabsConfig,
  // Backward compatibility exports
  parsePrismRoozyLabsStdoutLine as parseRoozyGatewayStdoutLine,
  buildPrismRoozyLabsConfig as buildRoozyGatewayConfig,
};

export type { TranscriptEntry };
