const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/** Drops fenced code, including an unclosed fence through the end of the reply. */
export function stripFencedCode(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let fence: { marker: string; length: number } | null = null;
  for (const line of lines) {
    const match = FENCE.exec(line);
    if (fence) {
      const closed =
        match !== null &&
        match[2].startsWith(fence.marker) &&
        match[2].length >= fence.length &&
        match[3].trim() === "";
      if (closed) fence = null;
      continue;
    }
    if (match) {
      fence = { marker: match[2][0] ?? "`", length: match[2].length };
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function stripInlineCode(markdown: string): string {
  return markdown.replace(/``+[^`\n]*``+/g, " ").replace(/(^|[^`])`[^`\n]*`/g, "$1 ");
}

function replaceLinksAndImages(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)\n]*\)/g, (_match, alt: string) => ` ${alt} `)
    .replace(/\[([^\]]*)\]\([^)\n]*\)/g, (_match, label: string) => ` ${label} `)
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, (_match, label: string) => ` ${label} `);
}

function stripBareDestinations(markdown: string): string {
  return markdown
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
    .replace(/<?https?:\/\/[^\s>)]+>?/gi, " ")
    .replace(/\bwww\.[^\s>)]+/gi, " ")
    .replace(/mailto:[^\s>)]+/gi, " ");
}

function stripMarkup(markdown: string): string {
  return markdown
    .replace(/<[^>\n]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, (_match, title: string) => punctuate(title.trim()))
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/\|/g, "，")
    .replace(/\*\*|__|~~/g, "")
    .replace(/(^|[\s，。])[*_](?=\S)/g, "$1")
    .replace(/[*_](?=[\s，。]|$)/g, "");
}

function punctuate(title: string): string {
  if (!title) return "";
  return /[。！？.!?]$/.test(title) ? title : `${title}。`;
}

function collapseWhitespace(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([，。！？])/g, "$1")
    .trim();
}

/**
 * Prose a Chinese TTS engine can read. Code, bare URLs, and link or image
 * destinations are removed. Link labels, image alt text, headings, and list
 * items stay.
 */
export function sanitizeMarkdownForSpeech(markdown: string): string {
  const withoutFences = stripFencedCode(markdown);
  const withoutInline = stripInlineCode(withoutFences);
  const withLabels = replaceLinksAndImages(withoutInline);
  const withoutDestinations = stripBareDestinations(withLabels);
  return collapseWhitespace(stripMarkup(withoutDestinations));
}
