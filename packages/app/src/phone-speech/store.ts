import {
  createSpeechState,
  reduceSpeech,
  type SpeechCommand,
  type SpeechControllerState,
  type SpeechEvent,
} from "./controller";

type SpeechExecutor = (commands: readonly SpeechCommand[]) => void;

let state: SpeechControllerState = createSpeechState();
const listeners = new Set<() => void>();
let execute: SpeechExecutor = () => {};

export function getSpeechState(): SpeechControllerState {
  return state;
}

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSpeechExecutor(next: SpeechExecutor): () => void {
  execute = next;
  return () => {
    if (execute === next) execute = () => {};
  };
}

export function dispatchSpeech(event: SpeechEvent): void {
  const transition = reduceSpeech(state, event);
  state = transition.state;
  for (const listener of listeners) listener();
  if (transition.commands.length > 0) execute(transition.commands);
}

export function selectSpeakingKey(): string | null {
  return state.current?.key ?? null;
}

export function selectSpeechAgentId(): string | null {
  const sessionId = state.sessionId;
  if (!sessionId) return null;
  const split = sessionId.indexOf("\u0000");
  return split === -1 ? null : sessionId.slice(split + 1);
}
