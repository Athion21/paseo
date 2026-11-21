import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "paseo.phoneSpeech.spokenKeys";
const MAX_KEYS = 400;

/** Persists dedup keys only. Reply text never goes into storage. */
export async function loadSpokenKeys(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((key): key is string => typeof key === "string").slice(-MAX_KEYS);
}

export async function saveSpokenKeys(keys: readonly string[]): Promise<void> {
  const capped = keys.slice(-MAX_KEYS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
}
