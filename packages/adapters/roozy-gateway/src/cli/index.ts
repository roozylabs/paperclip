import { printRoozyGatewayStreamEvent } from "./format-event.js";

export const roozyGatewayCLIAdapter = {
  type: "roozy_gateway" as const,
  formatStdoutEvent: printRoozyGatewayStreamEvent,
};
