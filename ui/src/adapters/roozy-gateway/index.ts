import type { UIAdapterModule } from "../types";
import { parseRoozyGatewayStdoutLine, buildRoozyGatewayConfig } from "@paperclipai/adapter-roozy-gateway/ui";
import { RoozyGatewayConfigFields } from "./config-fields";

export const roozyGatewayUIAdapter: UIAdapterModule = {
  type: "roozy_gateway",
  label: "Roozy AI Gateway",
  parseStdoutLine: parseRoozyGatewayStdoutLine,
  ConfigFields: RoozyGatewayConfigFields,
  buildAdapterConfig: buildRoozyGatewayConfig,
};
