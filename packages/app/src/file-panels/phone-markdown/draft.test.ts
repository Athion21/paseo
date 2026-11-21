import { describe, expect, it } from "vitest";
import {
  applySaveResult,
  editDraft,
  noteRemoteSource,
  openDraft,
  shouldWarnOnLeave,
  suggestedMarkdownFilename,
} from "./draft";

describe("phone markdown save-as draft", () => {
  it("tracks unsaved edits and warns before leaving", () => {
    const clean = openDraft("# 标题\n");
    expect(shouldWarnOnLeave(clean)).toBe(false);
    const dirty = editDraft(clean, "# 标题\n\n改过");
    expect(dirty.dirty).toBe(true);
    expect(shouldWarnOnLeave(dirty)).toBe(true);
    expect(editDraft(dirty, clean.source).dirty).toBe(false);
  });

  it("keeps the edit buffer when the system picker is cancelled or the write fails", () => {
    const dirty = editDraft(openDraft("原文"), "改过的正文");
    const cancelled = applySaveResult(dirty, { status: "cancelled" });
    const failed = applySaveResult(dirty, { status: "failed", reason: "disk full" });

    expect(cancelled).toEqual(dirty);
    expect(failed).toEqual(dirty);
    expect(failed.draft).toBe("改过的正文");
    expect(applySaveResult(dirty, { status: "saved" })).toEqual({
      source: "改过的正文",
      draft: "改过的正文",
      dirty: false,
    });
  });

  it("keeps unsaved edits when the host copy changes or disappears", () => {
    const dirty = editDraft(openDraft("原文"), "还在编辑");
    const changed = noteRemoteSource(dirty, "主机上的新内容");
    const missing = noteRemoteSource(dirty, "");

    expect(changed.remoteChanged).toBe(true);
    expect(changed.draft.draft).toBe("还在编辑");
    expect(missing.draft.draft).toBe("还在编辑");
    expect(noteRemoteSource(openDraft("原文"), "新原文").draft).toEqual(openDraft("新原文"));
  });

  it("suggests a markdown filename without using the remote path as a directory", () => {
    expect(suggestedMarkdownFilename("docs/指南.md", "笔记.md")).toBe("指南.md");
    expect(suggestedMarkdownFilename("docs\\readme", "笔记.md")).toBe("readme.md");
    expect(suggestedMarkdownFilename("", "笔记.md")).toBe("笔记.md");
    expect(suggestedMarkdownFilename("a/../../secret.md", "笔记.md")).toBe("secret.md");
  });
});
