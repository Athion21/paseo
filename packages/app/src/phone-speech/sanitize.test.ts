import { describe, expect, it } from "vitest";
import { chunkSpeech } from "./chunk";
import { sanitizeMarkdownForSpeech } from "./sanitize";

describe("sanitizeMarkdownForSpeech", () => {
  it("keeps prose, headings, lists, and link labels", () => {
    const spoken = sanitizeMarkdownForSpeech(`# 安装

请看 [文档](https://example.com/docs) 和 https://example.com/raw。

- 第一步
- 第二步
`);

    expect(spoken).toContain("安装。");
    expect(spoken).toContain("请看 文档");
    expect(spoken).toContain("第一步");
    expect(spoken).toContain("第二步");
    expect(spoken).not.toContain("https://");
    expect(spoken).not.toContain("example.com");
  });

  it("drops fenced code, inline code, and image destinations", () => {
    const spoken = sanitizeMarkdownForSpeech(
      "正文 `rm -rf /` 继续\n\n```ts\nconst secret = 'sk-test';\n```\n\n结尾 ![架构图](https://cdn.example/a.png)",
    );

    expect(spoken).toContain("正文");
    expect(spoken).toContain("继续");
    expect(spoken).toContain("结尾");
    expect(spoken).toContain("架构图");
    expect(spoken).not.toContain("rm -rf");
    expect(spoken).not.toContain("sk-test");
    expect(spoken).not.toContain("cdn.example");
    expect(spoken).not.toContain("```");
  });

  it("drops an unclosed fence instead of reading it", () => {
    expect(sanitizeMarkdownForSpeech("前面\n```\nsecret token\n")).toBe("前面");
  });
});

describe("chunkSpeech", () => {
  it("returns the full prose in order instead of truncating", () => {
    const sentence = "这是一句完整的中文。";
    const text = sentence.repeat(400);
    const parts = chunkSpeech(text, 50);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(text);
    expect(parts.every((part) => part.length <= 50)).toBe(true);
  });

  it("splits a long run with no punctuation without dropping the tail", () => {
    const text = "甲".repeat(120);
    expect(chunkSpeech(text, 40).join("")).toBe(text);
  });
});
