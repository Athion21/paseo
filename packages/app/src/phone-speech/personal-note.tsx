import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { settingsStyles } from "@/styles/settings";
import { isPersonalAndroidBuild } from "./personal-build";

export function PersonalBuildNote() {
  const { t } = useTranslation();
  if (!isPersonalAndroidBuild()) return null;
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("phone.about.title")}</Text>
        <Text style={settingsStyles.rowHint}>{t("phone.about.body")}</Text>
      </View>
    </View>
  );
}
