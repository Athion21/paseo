export interface LiveTurnNotice {
  serverId: string;
  agentId: string;
  type: "turn_completed" | "turn_failed" | "turn_canceled";
  turnId?: string;
}

type LiveTurnListener = (notice: LiveTurnNotice) => void;

const listeners = new Set<LiveTurnListener>();

export function publishLiveTurn(notice: LiveTurnNotice): void {
  for (const listener of listeners) listener(notice);
}

export function subscribeLiveTurns(listener: LiveTurnListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
