import { useCallback, useSyncExternalStore } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { StreamItem } from "@/types/stream";
import { chunkSpeech } from "./chunk";
import { speechContentKey, turnSpeechKey } from "./reply";
import { sanitizeMarkdownForSpeech } from "./sanitize";
import { dispatchSpeech, selectSpeechAgentId, selectSpeakingKey, subscribeSpeech } from "./store";

export function PhoneSpeechTurnButton({
  items,
  startIndex,
  getText,
}: {
  items: readonly StreamItem[];
  startIndex: number;
  getText: () => string;
}) {
  const { t } = useTranslation();
  const agentId = useSyncExternalStore(subscribeSpeech, selectSpeechAgentId, selectSpeechAgentId);
  const speakingKey = useSyncExternalStore(subscribeSpeech, selectSpeakingKey, selectSpeakingKey);
  const turnKey = agentId ? turnSpeechKey(agentId, items, startIndex) : null;
  const speaking = turnKey !== null && speakingKey === turnKey;

  const onPress = useCallback(() => {
    if (!agentId || !turnKey) return;
    if (speaking) {
      dispatchSpeech({ type: "stop" });
      return;
    }
    const raw = getText().trim();
    const chunks = chunkSpeech(sanitizeMarkdownForSpeech(raw));
    if (chunks.length === 0) {
      Alert.alert(t("phone.speech.replay"), t("phone.speech.nothingToRead"));
      return;
    }
    dispatchSpeech({
      type: "replay",
      reply: {
        key: turnKey,
        contentKey: speechContentKey(agentId, raw),
        token: `replay:${turnKey}:${Date.now().toString(36)}`,
        chunks,
      },
    });
  }, [agentId, getText, speaking, t, turnKey]);

  if (!turnKey) return null;

  const label = speaking ? t("phone.speech.stop") : t("phone.speech.replay");
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onPress}
      accessibilityLabel={label}
      testID="phone-speech-turn-button"
    >
      {label}
    </Button>
  );
}
