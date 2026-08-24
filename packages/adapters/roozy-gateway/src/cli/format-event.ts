import pc from "picocolors";
import { parseRoozyGatewayStdoutLine } from "../ui/parse-stdout.js";

export function printRoozyGatewayStreamEvent(
  raw: string,
  debug: boolean,
): void {
  const entries = parseRoozyGatewayStdoutLine(raw, new Date().toISOString());
  for (const entry of entries) {
    switch (entry.kind) {
      case "init":
        console.log(pc.cyan(`[roozy] model=${entry.model}`));
        break;
      case "system":
        console.log(pc.dim(entry.text));
        break;
      case "assistant":
        process.stdout.write(entry.text);
        break;
      case "result":
        if (entry.isError) {
          console.log(pc.red(`\n[error] ${entry.errors.join(", ") || "failed"}`));
        } else {
          console.log(
            pc.green(
              `\n[done] tokens_in=${entry.inputTokens} tokens_out=${entry.outputTokens}`,
            ),
          );
        }
        break;
      case "stderr":
        console.error(pc.yellow(entry.text));
        break;
      case "stdout":
        process.stdout.write(entry.text);
        break;
      default:
        if (debug) {
          console.log(pc.dim(`[roozy:${entry.kind}] ${JSON.stringify(entry)}`));
        }
        break;
    }
  }
}
