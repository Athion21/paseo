import { useFileText, useWorkspace, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EditingTextInput } from "@/components/ui/text-input";
import { useSessionStore } from "@/stores/session-store";
import { useDiagnosticDetail } from "@/phone-speech/diagnostic";
import { FileMarkdownPreview } from "../markdown-preview";
import { FilePanelLoading } from "../loading";
import { selectSourcePresentation } from "../source/readonly/presentation";
import {
  applySaveResult,
  editDraft,
  noteRemoteSource,
  openDraft,
  suggestedMarkdownFilename,
  type MarkdownDraft,
  type PhoneSaveResult,
} from "./draft";
import { saveTextDocument } from "./save";

type MarkdownMode = "preview" | "edit";

export function PhoneMarkdownPanel({ file, params, workspaceId, host, tab }: PluginFilePanelProps) {
  const { t } = useTranslation();
  const text = useFileText(file);
  const client = useSessionStore((state) => state.sessions[host.id]?.client ?? null);
  const workspaceRoot = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const presentation = selectSourcePresentation({ size: file.size, platform: "native" });
  const [mode, setMode] = useState<MarkdownMode>("preview");
  const [draft, setDraft] = useState<MarkdownDraft | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const readyText = text.status === "ready" ? text.text : null;
  const loadError = text.status === "error" ? text.error.message : "";
  const loadDetail = useDiagnosticDetail(loadError);

  useEffect(() => {
    tab.setModified(draft?.dirty ?? false);
  }, [draft?.dirty, tab]);

  useEffect(() => {
    if (readyText === null) return;
    const current = draftRef.current;
    if (!current) {
      setDraft(openDraft(readyText));
      return;
    }
    const next = noteRemoteSource(current, readyText);
    if (next.remoteChanged) setNotice(t("phone.markdown.remoteChanged"));
    if (next.draft !== current) {
      if (!current.dirty) setEditorEpoch((epoch) => epoch + 1);
      setDraft(next.draft);
    }
  }, [readyText, t]);

  const onChangeDraft = useCallback((next: string) => {
    setDraft((current) => (current ? editDraft(current, next) : current));
  }, []);
  const save = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    if (saving) {
      setNotice(t("phone.markdown.busy"));
      return;
    }
    setSaving(true);
    setNotice(t("phone.markdown.saving"));
    void saveTextDocument({
      suggestedName: suggestedMarkdownFilename(params.path, t("phone.markdown.fallbackName")),
      text: current.draft,
    })
      .then((result) => {
        setDraft((existing) => (existing ? applySaveResult(existing, result) : existing));
        setNotice(messageForSave(result, t));
        return undefined;
      })
      .finally(() => setSaving(false));
  }, [params.path, saving, t]);

  if (presentation === "unsupported") {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("panels.file.tooLargeToDisplay")}</Text>
      </View>
    );
  }
  if (!draft && text.status === "loading") return <FilePanelLoading />;
  if (!draft && text.status === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadDetail || t("panels.file.failedToLoad")}</Text>
      </View>
    );
  }
  if (!draft) return <FilePanelLoading />;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <SegmentedControl
          size="sm"
          value={mode}
          onValueChange={setMode}
          testID="phone-markdown-mode"
          options={[
            {
              value: "preview",
              label: t("phone.markdown.preview"),
              testID: "phone-markdown-preview",
            },
            { value: "edit", label: t("phone.markdown.edit"), testID: "phone-markdown-edit" },
          ]}
        />
        <Button
          variant="outline"
          onPress={save}
          disabled={saving}
          accessibilityLabel={t("phone.markdown.saveAs")}
          testID="phone-markdown-save"
        >
          {t("phone.markdown.saveAs")}
        </Button>
      </View>
      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {text.status === "error" ? <Text style={styles.error}>{loadDetail}</Text> : null}
      {mode === "preview" ? (
        <ScrollView style={styles.container} contentContainerStyle={styles.preview}>
          <FileMarkdownPreview
            source={draft.draft}
            filePath={params.path}
            workspaceRoot={workspaceRoot ?? ""}
            client={client}
            serverId={host.id}
          />
        </ScrollView>
      ) : (
        <EditingTextInput
          key={`${params.path}:${editorEpoch}`}
          initialValue={draft.draft}
          onChangeText={onChangeDraft}
          multiline
          autoCorrect={false}
          autoCapitalize="none"
          textAlignVertical="top"
          style={styles.editor}
          accessibilityLabel={t("phone.markdown.edit")}
          testID="phone-markdown-editor"
        />
      )}
    </View>
  );
}

function messageForSave(result: PhoneSaveResult, t: TFunction): string {
  if (result.status === "saved") return t("phone.markdown.saved");
  if (result.status === "cancelled") return t("phone.markdown.cancelled");
  if (result.reason === "busy") return t("phone.markdown.busy");
  if (result.reason === "unavailable") return t("phone.markdown.unavailable");
  return t("phone.markdown.failed", { detail: result.reason });
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  notice: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  preview: { paddingBottom: theme.spacing[6] },
  editor: {
    flex: 1,
    minHeight: 0,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface0,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
}));
