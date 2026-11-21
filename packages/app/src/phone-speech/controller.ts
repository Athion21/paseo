export interface SpeechReply {
  key: string;
  contentKey: string;
  token: string;
  chunks: readonly string[];
}

export interface SpeechControllerState {
  enabled: boolean;
  foreground: boolean;
  sessionId: string | null;
  ignoredKeys: ReadonlySet<string>;
  spokenKeys: ReadonlySet<string>;
  queue: readonly SpeechReply[];
  current: SpeechReply | null;
}

export type SpeechEvent =
  | { type: "set-enabled"; enabled: boolean }
  | { type: "set-foreground"; foreground: boolean }
  | { type: "replace-spoken"; keys: readonly string[] }
  | { type: "show-session"; sessionId: string; presentKeys: readonly string[] }
  | { type: "hide-session"; sessionId: string }
  | { type: "turn-completed"; sessionId: string; reply: SpeechReply | null }
  | { type: "replay"; reply: SpeechReply }
  | { type: "stop" }
  | { type: "utterance-finished"; token: string }
  | { type: "utterance-failed"; token: string };

export interface SpeechCommandStop {
  type: "stop";
}

export interface SpeechCommandSpeak {
  type: "speak";
  token: string;
  chunks: readonly string[];
}

export type SpeechCommand = SpeechCommandStop | SpeechCommandSpeak;

export interface SpeechTransition {
  state: SpeechControllerState;
  commands: readonly SpeechCommand[];
}

const EMPTY: readonly SpeechCommand[] = [];

export function createSpeechState(spokenKeys: readonly string[] = []): SpeechControllerState {
  return {
    enabled: false,
    foreground: true,
    sessionId: null,
    ignoredKeys: new Set(),
    spokenKeys: new Set(spokenKeys),
    queue: [],
    current: null,
  };
}

function remember(keys: ReadonlySet<string>, reply: SpeechReply): ReadonlySet<string> {
  const next = new Set(keys);
  next.add(reply.key);
  next.add(reply.contentKey);
  return next;
}

function hasReply(keys: ReadonlySet<string>, reply: SpeechReply): boolean {
  return keys.has(reply.key) || keys.has(reply.contentKey);
}

function canAutoplay(state: SpeechControllerState): boolean {
  return state.enabled && state.foreground && state.sessionId !== null;
}

function stopCommand(stopped: boolean): readonly SpeechCommand[] {
  return stopped ? [{ type: "stop" }] : EMPTY;
}

function dropPlayback(state: SpeechControllerState): {
  state: SpeechControllerState;
  commands: readonly SpeechCommand[];
} {
  if (!state.current && state.queue.length === 0) {
    return { state, commands: EMPTY };
  }
  let ignored = state.ignoredKeys;
  if (state.current) ignored = remember(ignored, state.current);
  for (const reply of state.queue) ignored = remember(ignored, reply);
  return {
    state: { ...state, ignoredKeys: ignored, current: null, queue: [] },
    commands: [{ type: "stop" }],
  };
}

function begin(
  state: SpeechControllerState,
  reply: SpeechReply,
  queue: readonly SpeechReply[],
): SpeechTransition {
  return {
    state: {
      ...state,
      spokenKeys: remember(state.spokenKeys, reply),
      current: reply,
      queue,
    },
    commands: [{ type: "speak", token: reply.token, chunks: reply.chunks }],
  };
}

function advance(state: SpeechControllerState): SpeechTransition {
  const next = state.queue[0];
  if (!next || !canAutoplay(state)) {
    const dropped = dropPlayback({ ...state, current: null });
    return { state: dropped.state, commands: EMPTY };
  }
  return begin(state, next, state.queue.slice(1));
}

function withFlag(
  state: SpeechControllerState,
  flag: "enabled" | "foreground",
  value: boolean,
): SpeechTransition {
  if (state[flag] === value) return { state, commands: EMPTY };
  if (value) return { state: { ...state, [flag]: true }, commands: EMPTY };
  const dropped = dropPlayback(state);
  return { state: { ...dropped.state, [flag]: false }, commands: dropped.commands };
}

function showSession(
  state: SpeechControllerState,
  sessionId: string,
  presentKeys: readonly string[],
): SpeechTransition {
  const switched = state.sessionId !== sessionId;
  const dropped = switched ? dropPlayback(state) : { state, commands: EMPTY };
  const ignored = new Set(dropped.state.ignoredKeys);
  for (const key of presentKeys) ignored.add(key);
  return {
    state: { ...dropped.state, sessionId, ignoredKeys: ignored },
    commands: dropped.commands,
  };
}

function completeTurn(
  state: SpeechControllerState,
  sessionId: string,
  reply: SpeechReply | null,
): SpeechTransition {
  if (!reply || sessionId !== state.sessionId) return { state, commands: EMPTY };
  const skipped =
    reply.chunks.length === 0 ||
    !canAutoplay(state) ||
    hasReply(state.ignoredKeys, reply) ||
    hasReply(state.spokenKeys, reply);
  if (skipped) {
    if (reply.chunks.length === 0 || !canAutoplay(state)) {
      return {
        state: { ...state, ignoredKeys: remember(state.ignoredKeys, reply) },
        commands: EMPTY,
      };
    }
    return { state, commands: EMPTY };
  }
  if (state.current) {
    return { state: { ...state, queue: [...state.queue, reply] }, commands: EMPTY };
  }
  return begin(state, reply, state.queue);
}

function finishUtterance(
  state: SpeechControllerState,
  token: string,
  failed: boolean,
): SpeechTransition {
  if (state.current?.token !== token) return { state, commands: EMPTY };
  if (failed) {
    const dropped = dropPlayback({ ...state, current: null });
    return { state: dropped.state, commands: stopCommand(dropped.commands.length > 0) };
  }
  return advance({ ...state, current: null });
}

export function reduceSpeech(state: SpeechControllerState, event: SpeechEvent): SpeechTransition {
  switch (event.type) {
    case "replace-spoken":
      return { state: { ...state, spokenKeys: new Set(event.keys) }, commands: EMPTY };
    case "set-enabled":
      return withFlag(state, "enabled", event.enabled);
    case "set-foreground":
      return withFlag(state, "foreground", event.foreground);
    case "hide-session": {
      if (state.sessionId !== event.sessionId) return { state, commands: EMPTY };
      const dropped = dropPlayback(state);
      return { state: { ...dropped.state, sessionId: null }, commands: dropped.commands };
    }
    case "show-session":
      return showSession(state, event.sessionId, event.presentKeys);
    case "turn-completed":
      return completeTurn(state, event.sessionId, event.reply);
    case "replay":
      if (!state.foreground || event.reply.chunks.length === 0) return { state, commands: EMPTY };
      return begin({ ...state, queue: [] }, event.reply, []);
    case "stop":
      return dropPlayback(state);
    case "utterance-finished":
      return finishUtterance(state, event.token, false);
    case "utterance-failed":
      return finishUtterance(state, event.token, true);
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
