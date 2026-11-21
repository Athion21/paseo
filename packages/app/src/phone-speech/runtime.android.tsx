import { useEffect, useRef, useState } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAppSettings } from "@/hooks/use-settings";
import { useSessionStore } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import { chunkSpeech } from "./chunk";
import type { SpeechCommandSpeak } from "./controller";
import {
  prepareNativeSpeech,
  speakNative,
  stopNative,
  subscribeNativeSpeech,
} from "./engine.android";
import { subscribeLiveTurns } from "./live-turn";
import { completedAssistantSource, speechSessionId } from "./reply";
import { sanitizeMarkdownForSpeech } from "./sanitize";
import { loadSpokenKeys, saveSpokenKeys } from "./spoken-keys";
import { dispatchSpeech, getSpeechState, setSpeechExecutor, subscribeSpeech } from "./store";

function readItems(serverId: string, agentId: string): StreamItem[] {
  const session = useSessionStore.getState().sessions[serverId];
  return [
    ...(session?.agentStreamTail.get(agentId) ?? []),
    ...(session?.agentStreamHead.get(agentId) ?? []),
  ];
}

function explainMissingEngine(t: TFunction): void {
  Alert.alert(t("phone.speech.missingTitle"), t("phone.speech.missing"));
}

async function speakReply(command: SpeechCommandSpeak, t: TFunction): Promise<void> {
  let status = "unavailable";
  try {
    status = await prepareNativeSpeech();
  } catch {
    status = "unavailable";
  }
  if (getSpeechState().current?.token !== command.token) return;
  if (status !== "ready") {
    explainMissingEngine(t);
    dispatchSpeech({ type: "utterance-failed", token: command.token });
    return;
  }
  speakNative(command.chunks, command.token);
}

export function PhoneSpeechRuntime(): null {
  const { t } = useTranslation();
  const { settings, isLoading } = useAppSettings();
  const [keysReady, setKeysReady] = useState(false);
  const savedKeys = useRef("");
  const translate = useRef(t);
  translate.current = t;

  useEffect(() => {
    return setSpeechExecutor((commands) => {
      for (const command of commands) {
        if (command.type === "stop") {
          stopNative();
          continue;
        }
        void speakReply(command, translate.current);
      }
    });
  }, []);

  useEffect(() => {
    return subscribeNativeSpeech((event) => {
      if (event.type === "stopped") {
        dispatchSpeech({ type: "set-foreground", foreground: false });
        return;
      }
      if (!event.token) return;
      if (event.type === "done") {
        dispatchSpeech({ type: "utterance-finished", token: event.token });
        return;
      }
      if (event.type === "error") {
        if (event.code === "missing-offline-zh" || event.code === "unavailable") {
          explainMissingEngine(translate.current);
        }
        dispatchSpeech({ type: "utterance-failed", token: event.token });
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSpokenKeys()
      .then((keys) => {
        if (cancelled) return undefined;
        dispatchSpeech({ type: "replace-spoken", keys });
        savedKeys.current = keys.join("\n");
        setKeysReady(true);
        return undefined;
      })
      .catch((error: unknown) => {
        console.warn(
          "[phone-speech] could not load dedup keys",
          error instanceof Error ? error.name : "unknown",
        );
        if (!cancelled) setKeysReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeSpeech(() => {
      const keys = [...getSpeechState().spokenKeys];
      const serialized = keys.join("\n");
      if (serialized === savedKeys.current) return;
      savedKeys.current = serialized;
      void saveSpokenKeys(keys).catch((error: unknown) => {
        console.warn(
          "[phone-speech] could not persist dedup keys",
          error instanceof Error ? error.name : "unknown",
        );
      });
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    dispatchSpeech({ type: "set-enabled", enabled: settings.phoneReadAloud });
  }, [isLoading, settings.phoneReadAloud]);

  useEffect(() => {
    const apply = (next: AppStateStatus) => {
      dispatchSpeech({ type: "set-foreground", foreground: next === "active" });
    };
    apply(AppState.currentState);
    const subscription = AppState.addEventListener("change", apply);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!keysReady || isLoading) return;
    return subscribeLiveTurns((notice) => {
      if (notice.type !== "turn_completed") return;
      const sessionId = speechSessionId(notice.serverId, notice.agentId);
      const source = completedAssistantSource(
        notice.agentId,
        readItems(notice.serverId, notice.agentId),
        notice.turnId,
      );
      if (!source) {
        dispatchSpeech({ type: "turn-completed", sessionId, reply: null });
        return;
      }
      const chunks = chunkSpeech(sanitizeMarkdownForSpeech(source.text));
      dispatchSpeech({
        type: "turn-completed",
        sessionId,
        reply: {
          key: source.key,
          contentKey: source.contentKey,
          token: source.key,
          chunks,
        },
      });
    });
  }, [isLoading, keysReady]);

  return null;
}
