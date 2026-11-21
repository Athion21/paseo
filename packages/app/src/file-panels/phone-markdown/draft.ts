export type PhoneSaveResult =
  | { status: "saved" }
  | { status: "cancelled" }
  | { status: "failed"; reason: string };

export interface MarkdownDraft {
  source: string;
  draft: string;
  dirty: boolean;
}

export function openDraft(source: string): MarkdownDraft {
  return { source, draft: source, dirty: false };
}

export function editDraft(draft: MarkdownDraft, next: string): MarkdownDraft {
  return { source: draft.source, draft: next, dirty: next !== draft.source };
}

/** A cancelled or failed save keeps the edit buffer. A completed save clears the dirty flag. */
export function applySaveResult(draft: MarkdownDraft, result: PhoneSaveResult): MarkdownDraft {
  if (result.status !== "saved") return draft;
  return { source: draft.draft, draft: draft.draft, dirty: false };
}

export function shouldWarnOnLeave(draft: MarkdownDraft): boolean {
  return draft.dirty;
}

/**
 * A host refresh replaces a clean buffer. Unsaved edits stay put, and the caller
 * can tell the reader that the host copy moved.
 */
export function noteRemoteSource(
  draft: MarkdownDraft,
  nextSource: string,
): { draft: MarkdownDraft; remoteChanged: boolean } {
  if (draft.dirty) {
    return { draft, remoteChanged: nextSource !== draft.source };
  }
  if (nextSource === draft.source) return { draft, remoteChanged: false };
  return { draft: openDraft(nextSource), remoteChanged: false };
}

export function suggestedMarkdownFilename(path: string, fallback: string): string {
  let base = "";
  let current = "";
  for (const char of path) {
    if (char === "/" || char === "\\") {
      if (current.length > 0) base = current;
      current = "";
      continue;
    }
    if (char.charCodeAt(0) > 0x1f) current += char;
  }
  if (current.length > 0) base = current;
  const trimmed = base.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return fallback;
  return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
}
