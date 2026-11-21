/** Stay under Android's usual 4000-character TextToSpeech input cap. */
export const ANDROID_TTS_CHUNK_LIMIT = 3500;

const BREAK_MARKS = ["\n", "。", "！", "？", "；", ".", "!", "?", ";", "，", ",", " "];

function preferredBreak(window: string): number {
  let best = -1;
  for (const mark of BREAK_MARKS) {
    const index = window.lastIndexOf(mark);
    if (index > best) best = index + mark.length;
  }
  if (best >= window.length * 0.4) return best;
  return -1;
}

/**
 * Splits speech at sentence boundaries. The pieces cover the whole string;
 * nothing at the end is dropped when a piece hits the engine limit.
 */
export function chunkSpeech(text: string, limit = ANDROID_TTS_CHUNK_LIMIT): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (limit < 1) {
    throw new Error("Speech chunk limit must be positive");
  }
  const parts: string[] = [];
  let rest = normalized;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const breakAt = preferredBreak(window);
    const cut = breakAt > 0 ? breakAt : limit;
    const part = rest.slice(0, cut).trimEnd();
    if (part) parts.push(part);
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}
