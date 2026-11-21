import Constants from "expo-constants";
import { Platform } from "react-native";

export function isPersonalAndroidBuild(): boolean {
  if (Platform.OS !== "android") return false;
  return Constants.expoConfig?.extra?.personalBuild === true;
}
