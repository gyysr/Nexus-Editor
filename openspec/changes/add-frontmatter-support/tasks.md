# Implementation Tasks

## 1. Shared detector (`packages/core/src/frontmatter.ts`)

- [x] 1.1 Implement `detectFrontmatterBlock(source): { from: 0; to: number;
  value: string } | null` walking the source line by line (offset-based,
  tolerating CRLF via per-line `\r` strip).
- [x] 1.2 Opening fence: `/^(-{3,})[ \t]*$/` at offset 0 ONLY. Capture the
  opening run length; closing fence: `/^ {0,3}(-{3,})[ \t]*$/` with run
  length ≥ opening run. `- - -` must NOT match either fence.
- [x] 1.3 Unclosed block: valid frontmatter running to EOF. Blank body
  lines allowed. `value` = body minus the final line ending.
- [x] 1.4 Implement `frontmatterPosition(source, to)` computing real
  1-based unist line/column for the remark-side yaml node.
- [x] 1.5 Implement `createFrontmatterRemarkPlugin(source)` returning a
  unified transformer: no-op when `children[0]` is already `yaml`/`toml`
  (host registered remark-frontmatter); otherwise drop children whose
  `position.start.offset < block.to` and unshift the yaml node with real
  position.

## 2. Lezer→mdast adapter (`lezer-mdast-adapter.ts`)

- [x] 2.1 In `walkRoot`, run the detector first; when `null`, keep the
  existing sibling walk unchanged.
- [x] 2.2 With frontmatter: unshift an mdast `yaml` node whose position
  spans `[0, block.to)` and whose `value` is the raw body.
- [x] 2.3 Skip Lezer siblings fully inside the region (`node.to <=
  block.to`); keep siblings starting at/after `block.to` and adapt them
  against the original source (document coordinates preserved).
- [x] 2.4 Straddle recovery: when a sibling starts inside but ends after
  the region (e.g. an unclosed code fence inside the frontmatter that
  swallows the closing fence), re-parse `source.slice(block.to)` with the
  shared `getStringParser()` and shift every emitted mdast position by
  `block.to` (recursive `shiftPositions`).

## 3. unified pipeline (`editor.ts`)

- [x] 3.1 In `markdownToHtml`, register
  `createFrontmatterRemarkPlugin(markdown)` immediately after
  `.use(remarkParse)` — BEFORE host `remarkPlugins` so they observe the
  yaml node.

## 4. Public API (`types.ts` + `editor.ts`)

- [x] 4.1 Add `getFrontmatter(): string | null` to `EditorAPI` with a
  doc comment stating the raw-text-only contract (no YAML parsing in
  core).
- [x] 4.2 Implement it as `currentAst.children.find(child => child.type
  === "yaml")?.value ?? null`.

## 5. Live preview (`live-preview-ranges.ts` + `live-preview.ts`)

- [x] 5.1 Add `yaml` to `LivePreviewNode` and to the always-emitted block
  group in `visit()` (heading / list / code / definition / html / yaml).
- [x] 5.2 Implement `buildFrontmatterDecorations`: cursor inside the block
  (inclusive end) → no decoration (raw source editable); outside →
  `Decoration.replace` with a block widget showing a `··· frontmatter`
  chip (inline styles, `--nexus-text-muted` / `--nexus-border`, stable
  widget identity key `fm:<from>:<to>:<source>`).
- [x] 5.3 Chip `mousedown` drops the caret at the block start so the next
  decoration pass reveals the raw YAML; `preventDefault` +
  `stopPropagation` to avoid CM6 cursor placement.
- [x] 5.4 Route `range.node.type === "yaml"` in the `buildDecorations`
  chain (before the generic list branch).

## 6. Tests

- [x] 6.1 `packages/core/test/frontmatter.test.ts` (21 tests):
  - basic block offsets (yaml `[0, block.to)`, heading keeps document
    coordinates);
  - `getFrontmatter()` null / value / empty-body-is-empty-string;
  - unclosed block to EOF; `- - -` rejected; fence required at offset 0;
  - blank body lines preserved; `----` fences; closing run shorter than
    opening → not a fence;
  - markdown-looking body lines stay inside the yaml node;
  - straddle recovery (unclosed code fence swallows closing fence —
    paragraph + code positions shifted correctly);
  - `setDocument` adding frontmatter later updates the AST;
  - exportHTML strips the block (no `<hr>`, no metadata leak), all-
    frontmatter doc → empty string, host remarkPlugins observe the yaml
    node;
  - live preview: raw source with cursor inside, chip with cursor
    outside, chip click reveals source, edits tracked via
    `replaceRange`.
- [x] 6.2 `packages/plugin-wordcount/test/frontmatter.test.ts` (5 tests):
  `countMarkdown(source, { ast: editor.getAst() })` excludes the
  frontmatter body from words / characters / paragraphs, handles
  markdown-looking body lines and unclosed-to-EOF blocks, and matches
  the lazy-parser result for the same document.

## 7. Documentation

- [x] 7.1 `README.md` Editor API snippet — add `editor.getFrontmatter()`.
- [x] 7.2 `docs/ROADMAP.md` + `docs/ROADMAP.zh.md` — row #30 under
  "3. Core Editor", linking this change.
- [x] 7.3 `apps/electron-demo/sample-vault/frontmatter-demo.md` — sample
  note exercising the chip, TOC isolation, and `getFrontmatter()`.

## 8. Verify

- [x] 8.1 `pnpm typecheck` clean across the repo.
- [x] 8.2 `pnpm test` — 924/924 (existing 898 + 26 new). Run from repo
  root with `pnpm test`.
- [x] 8.3 `pnpm build` — all packages emit cleanly.
- [ ] 8.4 Manual smoke in the electron demo — deferred; the jsdom
  integration tests in `packages/core/test/frontmatter.test.ts` cover the
  same chip interactions a manual smoke would.
- [x] 8.5 `openspec validate add-frontmatter-support --strict` — passes
  ("Change 'add-frontmatter-support' is valid"), run via
  `npx -y @fission-ai/openspec validate add-frontmatter-support --strict`.
