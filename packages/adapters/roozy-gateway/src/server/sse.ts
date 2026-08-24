export interface SseFrame {
  event: string | null;
  data: string;
}

/**
 * Parse a buffer of SSE text into frames and remaining unparsed text.
 * Handles data: lines, event: lines, comment lines (:), and [DONE] sentinel.
 */
export function parseSseFrames(buffer: string): {
  frames: SseFrame[];
  rest: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames: SseFrame[] = [];
  let offset = 0;

  while (true) {
    const idx = normalized.indexOf("\n\n", offset);
    if (idx < 0) break;

    const rawFrame = normalized.slice(offset, idx);
    offset = idx + 2;

    let event: string | null = null;
    const dataLines: string[] = [];

    for (const line of rawFrame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    if (dataLines.length > 0) {
      frames.push({ event, data: dataLines.join("\n") });
    }
  }

  return { frames, rest: normalized.slice(offset) };
}

export interface StreamChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: unknown[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

/**
 * Parse a single SSE data string into a StreamChunk.
 * Returns null for "[DONE]" sentinel or unparseable data.
 */
export function parseStreamChunk(data: string): StreamChunk | null {
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data) as StreamChunk;
  } catch {
    return null;
  }
}

/**
 * Check if an SSE data string is the [DONE] sentinel.
 */
export function isDoneSentinel(data: string): boolean {
  return data === "[DONE]";
}
