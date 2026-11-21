import { useTranslation } from "react-i18next";

/** Chinese UI keeps the host's original diagnostic and adds a local explanation. */
export function useDiagnosticDetail(detail: string): string {
  const { t, i18n } = useTranslation();
  if (i18n.language !== "zh-CN" || detail.trim().length === 0) return detail;
  return t("phone.diagnostics.detail", { detail });
}

export function useDiagnosticSummary(detail: string): { title: string; description?: string } {
  const { t, i18n } = useTranslation();
  if (i18n.language !== "zh-CN") return { title: detail };
  return { title: t("phone.diagnostics.summary"), description: detail };
}
