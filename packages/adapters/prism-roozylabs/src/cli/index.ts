import { printPrismRoozyLabsStreamEvent } from "./format-event.js";

export const prismRoozyLabsCLIAdapter = {
  type: "prism_roozylabs" as const,
  formatStdoutEvent: printPrismRoozyLabsStreamEvent,
};

export { printPrismRoozyLabsStreamEvent };
