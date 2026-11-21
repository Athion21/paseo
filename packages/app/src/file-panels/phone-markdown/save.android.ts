import { requireNativeModule } from "expo-modules-core";
import type { PhoneSaveResult } from "./draft";

interface NativeSaveResult {
  status?: string;
  reason?: string;
}

interface NativePhoneExport {
  saveTextDocument(
    suggestedName: string,
    mimeType: string,
    text: string,
  ): Promise<NativeSaveResult>;
}

const native = requireNativeModule<NativePhoneExport>("PaseoPhoneExport");

export async function saveTextDocument(input: {
  suggestedName: string;
  text: string;
}): Promise<PhoneSaveResult> {
  try {
    const result = await native.saveTextDocument(input.suggestedName, "text/markdown", input.text);
    if (result.status === "saved" || result.status === "cancelled") {
      return { status: result.status };
    }
    return {
      status: "failed",
      reason: result.reason && result.reason.trim().length > 0 ? result.reason : "failed",
    };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.name : "unavailable" };
  }
}
