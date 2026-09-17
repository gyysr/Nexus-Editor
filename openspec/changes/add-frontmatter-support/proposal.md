# Change: Core YAML frontmatter support — dual-pipeline AST node + live-preview fold + `getFrontmatter()`

## Why

Frontmatter is the de-facto metadata convention of the Markdown ecosystem
(Obsidian, Hugo, Jekyll, Astro, Quarto, …). Today Nexus-Editor mis-parses
any note that begins with `---`:

- `getAst()` sees `thematicBreak + paragraph + thematicBreak`, so a heading
  inside the frontmatter body pollutes the table of contents, YAML list
  values surface as Markdown lists, and every AST-dependent plugin
  (wordcount, search, slash commands) sees garbage nodes.
- `exportHTML()` leaks the metadata block into the rendered article —
  `---` renders as `<hr>` and `title: Hello` as a paragraph.
- Live preview renders the raw fences like ordinary text; there is no
  Obsidian-style collapsed affordance.
- Hosts that want note metadata (display title, tags, publish date) have
  no API to read it — they must re-scan the raw document themselves,
  duplicating the parse the editor already performed.

## What Changes

- **`packages/core/src/frontmatter.ts` (NEW)** — one line-based
  `detectFrontmatterBlock(source)` detector shared by both AST pipelines.
  Semantics mirror `micromark-extension-frontmatter` exactly: opening
  fence `/^(-{3,})[ \t]*$/` only at offset 0; closing fence
  `/^ {0,3}(-{3,})[ \t]*$/` with run length ≥ opening run; unclosed block
  runs to EOF; blank body lines allowed; `- - -` is not a fence. Zero
  new runtime dependencies (no `remark-frontmatter` in core).
- **Lezer→mdast adapter** (`lezer-mdast-adapter.ts`) — `walkRoot` now
  unshifts a real mdast `yaml` node (correct document offsets) when the
  detector fires. Siblings fully inside the region are skipped; when a
  Lezer node straddles the region end (e.g. an unclosed code fence inside
  the frontmatter swallowing the closing fence) the remainder is re-parsed
  with the shared string parser and all positions are shifted by
  `block.to`. The common case stays on the incremental Lezer tree.
- **unified pipeline** (`editor.ts` → `markdownToHtml`) —
  `createFrontmatterRemarkPlugin(source)` normalizes the parsed tree right
  after `remarkParse`, **before** host `remarkPlugins` run, so plugins
  observe the same yaml-node shape as `getAst()`. No-op (idempotent) when
  the host already registered a real frontmatter parser.
- **Live preview** — the `yaml` node joins the always-emitted block group;
  with the cursor outside the block the source is replaced by a chip
  widget (`··· frontmatter`, cursor-aware: caret inside reveals raw
  source); clicking the chip drops the caret at the block start. Inline
  styles only — no new CSS files, uses existing `--nexus-*` variables.
- **Public API** — `EditorAPI.getFrontmatter(): string | null` returns the
  raw YAML body (fences stripped, trailing line ending removed) or `null`
  when the document has no frontmatter. Parsing the YAML itself is host
  policy; core exposes raw text only.
- **wordcount plugin** — no code change: `yaml` is already in
  `DEFAULT_EXCLUDE`; a new integration test pins the
  adapter ↔ walker contract on the editor-AST hot path.

No breaking changes. Documents without a leading `---` parse exactly as
before (the detector returns `null` and every pipeline is untouched).

## Impact

- Affected specs:
  - `frontmatter` (NEW capability) — detection semantics, dual-pipeline
    yaml node contract, `getFrontmatter()` behaviour, live-preview chip
    interaction.
- Affected code:
  - `packages/core/src/frontmatter.ts` (NEW).
  - `packages/core/src/lezer-mdast-adapter.ts` (walkRoot yaml node +
    straddle recovery).
  - `packages/core/src/editor.ts` (remark plugin registration +
    `getFrontmatter()`).
  - `packages/core/src/types.ts` (`LivePreviewNode`, `EditorAPI`).
  - `packages/core/src/live-preview-ranges.ts` + `live-preview.ts`
    (range emission + chip widget).
  - `packages/core/test/frontmatter.test.ts` (NEW, 21 tests).
  - `packages/plugin-wordcount/test/frontmatter.test.ts` (NEW, 5 tests).
  - `README.md` (Editor API snippet), `docs/ROADMAP.md` /
    `docs/ROADMAP.zh.md` (row #30), `apps/electron-demo/sample-vault/`
    (sample note).
- New external dependencies: **none**.
- Out of scope (explicit non-goals):
  - **TOML frontmatter** (`+++`) — the detector is fence-syntax-agnostic
    in spirit but only `---` is recognized; a follow-up can extend it.
  - **YAML parsing / serialization** — hosts bring their own
    `yaml`/`js-yaml`; core deliberately returns raw text.
  - **Frontmatter editing UI** (form-based property editor) — a widget
    could be layered on `getFrontmatter()` + `replaceRange()` later.
  - **Exporting frontmatter into HTML** — `exportHTML()` strips the block
    (article content only), matching remark-frontmatter's HTML behavior.
