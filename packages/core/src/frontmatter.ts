// YAML frontmatter detection shared by both AST pipelines.
//
// The editor keeps two parsers in play: the incremental Lezer tree that
// backs getAst()/live-preview, and the remark/unified pipeline used only
// for exportHTML() and host remarkPlugins. Both must agree on exactly
// which documents have frontmatter and what the raw YAML body is, so the
// line-based detection lives here in one place and both pipelines call it.
//
// Semantics mirror micromark-extension-frontmatter's defaults (which we
// intentionally do NOT depend on — zero new runtime deps):
//   - The opening fence is 3+ `-` and only trailing spaces/tabs, at the
//     very start of the document (offset 0, no leading whitespace).
//   - A closing fence is 3+ `-` (run length >= the opening run), up to 3
//     leading spaces, trailing whitespace only. An unclosed block runs
//     to EOF and is still frontmatter.
//   - Blank lines and any other content belong to the body.
//   - `- - -` is not a fence (markers must be consecutive).
//   - `value` is the body with the final line ending stripped.

import type { Root } from "mdast";

export interface FrontmatterBlock {
  /** Always 0 — frontmatter exists only at document start. */
  from: 0;
  /** End offset of the closing fence line (exclusive of the line break). */
  to: number;
  /** Raw YAML body between the fences, with the trailing line ending stripped. */
  value: string;
}

const FRONTMATTER_OPEN_RE = /^(-{3,})[ \t]*$/;
const FRONTMATTER_CLOSE_RE = /^ {0,3}(-{3,})[ \t]*$/;

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Detect a YAML frontmatter block at the start of `source`.
 * Returns null when the document does not begin with a valid fence.
 */
export function detectFrontmatterBlock(source: string): FrontmatterBlock | null {
  const firstLineEnd = source.indexOf("\n");
  const firstLine = stripCarriageReturn(
    firstLineEnd === -1 ? source : source.slice(0, firstLineEnd)
  );
  const open = FRONTMATTER_OPEN_RE.exec(firstLine);
  if (!open) return null;
  const openRun = open[1].length;

  // Offset of the first body line in `source` coordinates.
  let lineStart = (firstLineEnd === -1 ? source.length : firstLineEnd) + 1;
  const bodyStart = lineStart;

  let lineEnd = source.indexOf("\n", lineStart);
  while (lineStart <= source.length) {
    const raw = lineEnd === -1 ? source.slice(lineStart) : source.slice(lineStart, lineEnd);
    const line = stripCarriageReturn(raw);
    const close = FRONTMATTER_CLOSE_RE.exec(line);
    if (close && close[1].length >= openRun) {
      const value = source
        .slice(bodyStart, lineStart)
        .replace(/\r?\n$/, "");
      return { from: 0, to: lineStart + raw.length, value };
    }
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
    lineEnd = source.indexOf("\n", lineStart);
  }

  // Unclosed block: frontmatter runs to EOF and is still valid.
  return {
    from: 0,
    to: source.length,
    value: source.slice(bodyStart).replace(/\r?\n$/, ""),
  };
}

/**
 * Compute a unist Position for a frontmatter block. The remark tree used
 * by exportHTML() carries real line/column info, unlike the Lezer adapter
 * which only fills in offsets.
 */
function frontmatterPosition(
  source: string,
  to: number
): { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < to; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line, column: to - lineStart + 1, offset: to },
  };
}

/**
 * unified attacher that normalizes a leading frontmatter block into a
 * single mdast `yaml` node. remark-parse alone would tokenize
 * `---\ntitle: x\n---` as thematicBreak + paragraph + thematicBreak;
 * this transformer replaces whatever the parser produced inside the
 * detected block with one `yaml` node, so host remarkPlugins observe
 * the same shape the Lezer-backed `getAst()` exposes. No-op when the
 * host already registered a real frontmatter parser (the tree then has
 * a `yaml`/`toml` first child).
 */
export function createFrontmatterRemarkPlugin(source: string) {
  return () => (tree: Root) => {
    const first = tree.children[0] as { type: string } | undefined;
    if (first && (first.type === "yaml" || first.type === "toml")) return;
    const block = detectFrontmatterBlock(source);
    if (!block) return;
    tree.children = tree.children.filter((child) => {
      const start = child.position?.start?.offset;
      return typeof start !== "number" || start >= block.to;
    });
    tree.children.unshift({
      type: "yaml",
      value: block.value,
      position: frontmatterPosition(source, block.to),
    });
  };
}
