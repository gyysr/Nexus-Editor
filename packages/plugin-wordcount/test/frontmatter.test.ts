import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEditor, type EditorAPI } from "@floatboat/nexus-core";

import { countMarkdown } from "../src/count";

// The yaml node produced by the core Lezer→mdast adapter must be excluded
// from every prose metric — these tests pin the adapter ↔ walker contract
// on the hot path (`ast: editor.getAst()`), not just the lazy parser path
// already covered in count.test.ts.

describe("countMarkdown with the editor's frontmatter-aware AST", () => {
  let container: HTMLDivElement;
  let editor: EditorAPI;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    editor?.destroy();
    container.remove();
  });

  function countWithEditorAst(source: string) {
    editor = createEditor({ container, initialValue: source });
    return countMarkdown(source, { ast: editor.getAst() });
  }

  it("excludes the frontmatter body from word counts", () => {
    const stats = countWithEditorAst("---\ntitle: foo bar\n---\nhello world");
    expect(stats.words).toBe(2);
    expect(stats.latinWords).toBe(2);
  });

  it("does not count the frontmatter body as prose characters", () => {
    const source = "---\ntitle: Hello\ntags:\n  - a\n---\n\nBody text\n";
    const stats = countWithEditorAst(source);
    expect(stats.characters).toBe("Body text".length);
    expect(stats.paragraphs).toBe(1);
  });

  it("does not count markdown-looking frontmatter lines as prose", () => {
    const source = "---\n# fake heading\n- list item\n---\nreal text\n";
    const stats = countWithEditorAst(source);
    expect(stats.words).toBe(2);
    expect(stats.paragraphs).toBe(1);
  });

  it("excludes an unclosed frontmatter block that runs to EOF", () => {
    const stats = countWithEditorAst("---\ndraft: true\n# not a heading");
    expect(stats.words).toBe(0);
    expect(stats.paragraphs).toBe(0);
  });

  it("matches the lazy-parser result for the same document", () => {
    const source = "---\ntitle: T\ntags: [a, b]\n---\n\nFirst para.\n\nSecond para.\n";
    editor = createEditor({ container, initialValue: source });
    const fromEditorAst = countMarkdown(source, { ast: editor.getAst() });
    const fromLazyParser = countMarkdown(source);
    expect(fromEditorAst).toEqual(fromLazyParser);
  });
});
