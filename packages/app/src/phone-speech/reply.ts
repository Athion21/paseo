export interface SpeechTimelineItem {
  kind: string;
  id: string;
  text?: string;
  turnId?: string;
}

export interface AssistantSpeechSource {
  key: string;
  contentKey: string;
  text: string;
}

export function speechSessionId(serverId: string, agentId: string): string {
  return `${serverId}\u0000${agentId}`;
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function speechKey(agentId: string, identity: string, text: string): string {
  return `${agentId}\u0000${identity}\u0000${text.length.toString(16)}\u0000${fnv1a(text)}`;
}

export function speechContentKey(agentId: string, text: string): string {
  return `${agentId}\u0000text\u0000${text.length.toString(16)}\u0000${fnv1a(text)}`;
}

function continuesAssistantTurn(previous: SpeechTimelineItem, next: SpeechTimelineItem): boolean {
  if (previous.turnId !== undefined && next.turnId !== undefined) {
    return previous.turnId === next.turnId;
  }
  return next.kind !== "user_message";
}

function continuesAt(items: readonly SpeechTimelineItem[], index: number): boolean {
  const previous = items[index];
  const next = items[index + 1];
  if (!previous || !next) return false;
  return continuesAssistantTurn(previous, next);
}

function sourceFromMessages(
  agentId: string,
  messages: SpeechTimelineItem[],
): AssistantSpeechSource | null {
  const text = messages
    .map((message) => message.text ?? "")
    .join("\n\n")
    .trim();
  if (!text) return null;
  const identity = messages[0]?.turnId ?? messages[0]?.id;
  if (!identity) return null;
  return {
    key: speechKey(agentId, identity, text),
    contentKey: speechContentKey(agentId, text),
    text,
  };
}

/** One entry per turn that has assistant prose. Thoughts, tools, and notices are skipped. */
export function assistantTurnSources(
  agentId: string,
  items: readonly SpeechTimelineItem[],
): AssistantSpeechSource[] {
  const sources: AssistantSpeechSource[] = [];
  let index = 0;
  while (index < items.length) {
    let end = index;
    while (continuesAt(items, end)) {
      end += 1;
    }
    const messages = items
      .slice(index, end + 1)
      .filter((item) => item.kind === "assistant_message");
    const source = sourceFromMessages(agentId, messages);
    if (source) sources.push(source);
    index = end + 1;
  }
  return sources;
}

export function presentSpeechKeys(agentId: string, items: readonly SpeechTimelineItem[]): string[] {
  const keys: string[] = [];
  for (const source of assistantTurnSources(agentId, items)) {
    keys.push(source.key, source.contentKey);
  }
  return keys;
}

/** The finished assistant prose for a turn. A missing turn id uses the last turn. */
export function completedAssistantSource(
  agentId: string,
  items: readonly SpeechTimelineItem[],
  turnId: string | undefined,
): AssistantSpeechSource | null {
  if (turnId) {
    const messages = items.filter(
      (item) => item.kind === "assistant_message" && item.turnId === turnId,
    );
    const matched = sourceFromMessages(agentId, messages);
    if (matched) return matched;
  }
  const sources = assistantTurnSources(agentId, items);
  return sources.at(-1) ?? null;
}

export function turnSpeechKey(
  agentId: string,
  items: readonly SpeechTimelineItem[],
  startIndex: number,
): string | null {
  const start = items[startIndex];
  if (!start) return null;
  let index = startIndex;
  while (index > 0 && continuesAt(items, index - 1)) {
    index -= 1;
  }
  let end = startIndex;
  while (continuesAt(items, end)) {
    end += 1;
  }
  const messages = items.slice(index, end + 1).filter((item) => item.kind === "assistant_message");
  return sourceFromMessages(agentId, messages)?.key ?? null;
}
