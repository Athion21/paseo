import type { PhoneSaveResult } from "./draft";

export async function saveTextDocument(_input: {
  suggestedName: string;
  text: string;
}): Promise<PhoneSaveResult> {
  return { status: "failed", reason: "unavailable" };
}
