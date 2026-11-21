import { useEffect, type ReactNode } from "react";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useSessionStore } from "@/stores/session-store";
import { presentSpeechKeys, speechSessionId } from "./reply";
import { dispatchSpeech } from "./store";

export function PhoneSpeechWatch({
  serverId,
  agentId,
  historyReady,
  children,
}: {
  serverId: string;
  agentId: string;
  historyReady: boolean;
  children: ReactNode;
}): ReactNode {
  const active = useRetainedPanelActive();
  const sessionId = speechSessionId(serverId, agentId);

  useEffect(() => {
    if (!active || !historyReady) {
      dispatchSpeech({ type: "hide-session", sessionId });
      return;
    }
    const session = useSessionStore.getState().sessions[serverId];
    const items = [
      ...(session?.agentStreamTail.get(agentId) ?? []),
      ...(session?.agentStreamHead.get(agentId) ?? []),
    ];
    dispatchSpeech({
      type: "show-session",
      sessionId,
      presentKeys: presentSpeechKeys(agentId, items),
    });
  }, [active, agentId, historyReady, serverId, sessionId]);

  return children;
}
