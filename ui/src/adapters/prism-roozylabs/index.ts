import type { UIAdapterModule } from "../types";
import { parsePrismRoozyLabsStdoutLine, buildPrismRoozyLabsConfig } from "@paperclipai/adapter-prism-roozylabs/ui";
import { PrismRoozyLabsConfigFields } from "./config-fields";

export const prismRoozyLabsUIAdapter: UIAdapterModule = {
  type: "prism_roozylabs",
  label: "Prism RoozyLabs",
  parseStdoutLine: parsePrismRoozyLabsStdoutLine,
  ConfigFields: PrismRoozyLabsConfigFields,
  buildAdapterConfig: buildPrismRoozyLabsConfig,
};
