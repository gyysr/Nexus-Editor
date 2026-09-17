# Frontmatter Spec — YAML frontmatter as a first-class AST node

## ADDED Requirements

### Requirement: Frontmatter Detection

The editor SHALL detect a YAML frontmatter block at the start of the
document using line-based semantics equivalent to
`micromark-extension-frontmatter`: the opening fence is `/^(-{3,})[ \t]*$/`
at offset 0 only; the closing fence is `/^ {0,3}(-{3,})[ \t]*$/` with a
dash run at least as long as the opening run; an unclosed block is valid
frontmatter running to end-of-file; blank body lines are allowed; `- - -`
is not a fence. The block value SHALL be the body text between the fences
without the trailing line ending.

#### Scenario: Basic block with correct offsets
- **WHEN** the document is `"---\ntitle: Hello\ntags:\n  - a\n---\n\n# Heading\n"`
- **THEN** `getAst().children[0]` SHALL be a `yaml` node with `value === "title: Hello\ntags:\n  - a"`
- **AND** its position SHALL span `[0, offsetOf("#") - 2)`
- **AND** the heading SHALL keep its document position at `offsetOf("#")`

#### Scenario: Unclosed block runs to EOF
- **WHEN** the document is `"---\ndraft: true\n# not a heading"`
- **THEN** the yaml node value SHALL be `"draft: true\n# not a heading"`
- **AND** its end offset SHALL equal the document length

#### Scenario: Non-fences are not frontmatter
- **WHEN** the document starts with `- - -\n`, or the `---` fence appears
  after other content, or the closing run is shorter than the opening run
- **THEN** the AST SHALL contain no `yaml` node
- **AND** `getFrontmatter()` SHALL return `null`

#### Scenario: Blank body lines preserved
- **WHEN** the document is `"---\na: 1\n\nb: 2\n---\nx"`
- **THEN** the yaml value SHALL be `"a: 1\n\nb: 2"`
- **AND** the body paragraph SHALL start at `offsetOf("x")`

### Requirement: Dual-Pipeline yaml Node

Both AST pipelines SHALL expose the same shape: the Lezer→mdast adapter
(`getAst()`, `onChange`) and the unified pipeline (`exportHTML()`) SHALL
represent the block as a single mdast `yaml` node. In the unified
pipeline the normalization SHALL run immediately after `remarkParse` and
BEFORE host `remarkPlugins`, and SHALL be a no-op when the tree already
has a `yaml`/`toml` first child (host registered a real frontmatter
parser). Straddling Lezer nodes (e.g. an unclosed code fence inside the
frontmatter swallowing the closing fence) SHALL be recovered by re-parsing
the remainder and shifting positions by the block end.

#### Scenario: exportHTML strips the block
- **WHEN** `exportHTML()` runs on a document with frontmatter
- **THEN** the output SHALL NOT contain an `<hr>` for the fences
- **AND** SHALL NOT leak metadata text (e.g. `title`) into the HTML

#### Scenario: Host remarkPlugins observe the yaml node
- **WHEN** a host plugin is registered via `remarkPlugins` and
  `exportHTML()` runs
- **THEN** the plugin's tree walk SHALL see `children[0].type === "yaml"`

#### Scenario: Straddle recovery
- **WHEN** the document is
  `"---\na: 1\n```js\nconst x = 1;\n---\nconst y = 2;\n```\n\nafter\n"`
- **THEN** the AST SHALL be `[yaml, paragraph("const y = 2;"), code, ...]`
- **AND** the paragraph start offset SHALL equal `offsetOf("const y")`

### Requirement: getFrontmatter Public API

`EditorAPI` SHALL expose `getFrontmatter(): string | null` returning the
raw YAML body (fences stripped, no trailing line ending) of the
document's first `yaml` node, or `null` when the document has no
frontmatter. An empty body SHALL return `""`, not `null`. Core SHALL NOT
parse or serialize YAML — hosts bring their own parser.

#### Scenario: Read metadata without a YAML dependency
- **WHEN** the document is `"---\ntitle: Hello\n---\n\nBody\n"`
- **THEN** `editor.getFrontmatter()` SHALL return `"title: Hello"`

#### Scenario: No frontmatter
- **WHEN** the document contains no leading frontmatter block
- **THEN** `editor.getFrontmatter()` SHALL return `null`

#### Scenario: Document edits are reflected
- **WHEN** `replaceRange` edits the frontmatter body
- **THEN** `getFrontmatter()` SHALL return the updated body on the next
  read

### Requirement: Live-Preview Chip

Live preview SHALL emit the `yaml` range unconditionally. While the
selection intersects the block (inclusive end) the raw source SHALL stay
visible and editable. Otherwise the block SHALL be replaced by a block
widget rendering a `··· frontmatter` chip styled with existing
`--nexus-*` CSS variables. Activating the chip (mousedown) SHALL move the
caret to the block start, revealing the raw source on the next decoration
pass.

#### Scenario: Cursor inside reveals raw source
- **WHEN** the caret is inside the frontmatter block
- **THEN** the rendered text SHALL contain the raw YAML body
- **AND** SHALL NOT contain the chip label

#### Scenario: Cursor outside folds the block
- **WHEN** the caret is outside the frontmatter block
- **THEN** the rendered text SHALL contain the chip label and the body
  content
- **AND** SHALL NOT contain the raw YAML body

#### Scenario: Chip click reveals the block
- **WHEN** the user mousedowns on the chip
- **THEN** the editor selection SHALL move to the block start
- **AND** the raw YAML SHALL become visible

### Requirement: Wordcount Integration

`@floatboat/nexus-plugin-wordcount`'s `countMarkdown` SHALL exclude the
frontmatter body from every prose metric when invoked with
`{ ast: editor.getAst() }`, matching the lazy-parser path. This requires
no plugin code change — `yaml` is already in `DEFAULT_EXCLUDE` — and this
requirement pins the adapter ↔ walker contract.

#### Scenario: Editor-AST hot path excludes frontmatter
- **WHEN** `countMarkdown("---\ntitle: foo bar\n---\nhello world", { ast: editor.getAst() })` is invoked
- **THEN** `words` SHALL equal `2`
- **AND** the result SHALL deep-equal the lazy-parser result for the same
  document
