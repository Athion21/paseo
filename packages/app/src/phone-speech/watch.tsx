import type { ReactNode } from "react";

export function PhoneSpeechWatch({
  children,
}: {
  serverId: string;
  agentId: string;
  historyReady: boolean;
  children: ReactNode;
}): ReactNode {
  return children;
}
