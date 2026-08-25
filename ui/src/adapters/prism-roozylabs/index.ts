import type { UIAdapterModule } from "../types";
import { parseRoozyGatewayStdoutLine, buildRoozyGatewayConfig } from "@paperclipai/adapter-prism-roozylabs/ui";
import { PrismRoozyLabsConfigFields } from "./config-fields";

export const prismRoozyLabsUIAdapter: UIAdapterModule = {
  type: "prism_roozylabs",
  label: "Prism RoozyLabs",
  parseStdoutLine: parseRoozyGatewayStdoutLine,
  ConfigFields: PrismRoozyLabsConfigFields,
  buildAdapterConfig: buildRoozyGatewayConfig,
};
