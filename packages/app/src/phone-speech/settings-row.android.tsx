import { useCallback } from "react";
import { Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-settings";
import { settingsStyles } from "@/styles/settings";

export function PhoneReadAloudSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const onChange = useCallback(
    (enabled: boolean) => {
      void updateSettings({ phoneReadAloud: enabled }).catch((error: unknown) => {
        Alert.alert(
          t("phone.speech.title"),
          t("phone.speech.failed", {
            detail: error instanceof Error ? error.name : "unknown",
          }),
        );
      });
    },
    [t, updateSettings],
  );

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("phone.speech.title")}</Text>
        <Text style={settingsStyles.rowHint}>{t("phone.speech.hint")}</Text>
        <Text style={settingsStyles.rowHint}>{t("phone.speech.privacy")}</Text>
      </View>
      <Switch
        value={settings.phoneReadAloud}
        onValueChange={onChange}
        accessibilityLabel={t("phone.speech.enabled")}
        testID="phone-read-aloud-switch"
      />
    </View>
  );
}
