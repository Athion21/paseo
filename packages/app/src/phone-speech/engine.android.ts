import { requireNativeModule, type EventSubscription } from "expo-modules-core";

export interface NativeSpeechStatus {
  type: string;
  token?: string;
  code?: string;
}

interface NativePhoneSpeech {
  prepare(): Promise<string>;
  speak(chunks: string[], token: string): void;
  stop(): void;
  addListener(event: "status", listener: (event: NativeSpeechStatus) => void): EventSubscription;
}

const native = requireNativeModule<NativePhoneSpeech>("PaseoPhoneSpeech");

export function subscribeNativeSpeech(listener: (event: NativeSpeechStatus) => void): () => void {
  const subscription = native.addListener("status", listener);
  return () => subscription.remove();
}

export function prepareNativeSpeech(): Promise<string> {
  return native.prepare();
}

export function speakNative(chunks: readonly string[], token: string): void {
  native.speak([...chunks], token);
}

export function stopNative(): void {
  native.stop();
}
