import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Root } from "mdast";
import type { Plugin } from "unified";

import { createEditor, type EditorAPI } from "../src/index";

beforeAll(() => {
  if (!("getClientRects" in Range.prototype)) {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [] as unknown as DOMRectList,
    });
  }
  if (!("getBoundingClientRect" in Range.prototype)) {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
});

function createWithDoc(
  initialValue: string,
  plugins: unknown[] = []
): { editor: EditorAPI; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const editor = createEditor({
    container,
    initialValue,
    plugins: plugins as never,
    livePreview: true,
  });
  return { editor, container };
}

function textOf(node: unknown): string {
  let out = "";
  const walk = (n: any) => {
    if (n?.value) out += n.value;
    if (n?.children) for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}

describe("frontmatter AST", () => {
  it("parses a basic block into a yaml node with correct offsets", () => {
    const source = "---\ntitle: Hello\ntags:\n  - a\n---\n\n# Heading\n";
    const { editor } = createWithDoc(source);
    const ast = editor.getAst();

    expect(ast.children[0]?.type).toBe("yaml");
    const yaml = ast.children[0] as { value: string; position?: { start: { offset?: number }; end: { offset?: number } } };
    expect(yaml.value).toBe("title: Hello\ntags:\n  - a");
    expect(yaml.position?.start.offset).toBe(0);
    expect(yaml.position?.end.offset).toBe(source.indexOf("#") - 2);

    // The heading after the frontmatter keeps its document coordinates.
    const heading = ast.children[1] as { type: string; position?: { start: { offset?: number } } };
    expect(heading.type).toBe("heading");
    expect(heading.position?.start.offset).toBe(source.indexOf("#"));
    editor.destroy();
  });

  it("returns null from getFrontmatter when there is no frontmatter", () => {
    const { editor } = createWithDoc("# Hi\n\nbody\n");
    expect(editor.getFrontmatter()).toBeNull();
    expect(editor.getAst().children[0]?.type).toBe("heading");
    editor.destroy();
  });

  it("exposes the raw YAML body via getFrontmatter", () => {
    const { editor } = createWithDoc("---\ntitle: Hello\ntags:\n  - a\n---\n\n# Heading\n");
    expect(editor.getFrontmatter()).toBe("title: Hello\ntags:\n  - a");
    editor.destroy();
  });

  it("treats an empty frontmatter body as an empty string, not null", () => {
    const { editor } = createWithDoc("---\n---\nbody\n");
    expect(editor.getFrontmatter()).toBe("");
    editor.destroy();
  });

  it("lets an unclosed block run to EOF", () => {
    const source = "---\ndraft: true\n# not a heading";
    const { editor } = createWithDoc(source);
    const ast = editor.getAst();

    expect(ast.children).toHaveLength(1);
    const yaml = ast.children[0] as { value: string; position?: { end: { offset?: number } } };
    expect(yaml.value).toBe("draft: true\n# not a heading");
    expect(yaml.position?.end.offset).toBe(source.length);
    expect(editor.getFrontmatter()).toBe("draft: true\n# not a heading");
    editor.destroy();
  });

  it("does not treat `- - -` as a fence", () => {
    const { editor } = createWithDoc("- - -\ntext\n");
    expect(editor.getFrontmatter()).toBeNull();
    expect(editor.getAst().children.some((c) => c.type === "yaml")).toBe(false);
    editor.destroy();
  });

  it("requires the fence at document start", () => {
    const source = "text\n\n---\nnot: fm\n---\n";
    const { editor } = createWithDoc(source);
    expect(editor.getFrontmatter()).toBeNull();
    const types = editor.getAst().children.map((c) => c.type);
    expect(types[0]).toBe("paragraph");
    expect(types.some((t) => t === "yaml")).toBe(false);
    editor.destroy();
  });

  it("preserves blank lines inside the body", () => {
    const source = "---\na: 1\n\nb: 2\n---\nx";
    const { editor } = createWithDoc(source);
    const ast = editor.getAst();

    const yaml = ast.children[0] as { value: string; position?: { end: { offset?: number } } };
    expect(yaml.value).toBe("a: 1\n\nb: 2");
    expect(yaml.position?.end.offset).toBe(source.indexOf("x") - 1);

    const body = ast.children[1] as { type: string; position?: { start: { offset?: number } } };
    expect(body.type).toBe("paragraph");
    expect(body.position?.start.offset).toBe(source.indexOf("x"));
    editor.destroy();
  });

  it("supports fences longer than three dashes", () => {
    const { editor } = createWithDoc("----\nkey: v\n----\n");
    expect(editor.getFrontmatter()).toBe("key: v");
    editor.destroy();
  });

  it("requires the closing fence to be at least as long as the opening one", () => {
    const source = "----\nkey: v\n---\ntail\n";
    const { editor } = createWithDoc(source);
    const ast = editor.getAst();

    expect(ast.children).toHaveLength(1);
    const yaml = ast.children[0] as { value: string; position?: { end: { offset?: number } } };
    expect(yaml.value).toBe("key: v\n---\ntail");
    expect(yaml.position?.end.offset).toBe(source.length);
    editor.destroy();
  });

  it("keeps markdown-looking body lines inside the frontmatter", () => {
    const source = "---\n# fake\n- item\n---\nreal text\n";
    const { editor } = createWithDoc(source);
    const ast = editor.getAst();

    expect(ast.children).toHaveLength(2);
    const yaml = ast.children[0] as { value: string };
    expect(yaml.value).toBe("# fake\n- item");
    const body = ast.children[1] as { type: string; position?: { start: { offset?: number } } };
    expect(body.type).toBe("paragraph");
    expect(textOf(body)).toBe("real text");
    expect(body.position?.start.offset).toBe(source.indexOf("real"));
    editor.destroy();
  });

  it("recovers positions when an unclosed code fence swallows the closing fence", () => {
    const source = "---\na: 1\n```js\nconst x = 1;\n---\nconst y = 2;\n```\n\nafter\n";
    const { editor } = createWithDoc(source);
    const ast = editor.getAst();

    expect(ast.children[0]?.type).toBe("yaml");
    const para = ast.children[1] as {
      type: string;
      position?: { start: { offset?: number } };
    };
    expect(para.type).toBe("paragraph");
    expect(textOf(para)).toBe("const y = 2;");
    expect(para.position?.start.offset).toBe(source.indexOf("const y"));
    const code = ast.children[2] as { type: string };
    expect(code.type).toBe("code");
    editor.destroy();
  });

  it("updates the AST when frontmatter is added later", () => {
    const { editor } = createWithDoc("# Hi\n");
    expect(editor.getFrontmatter()).toBeNull();
    editor.setDocument("---\nx: 1\n---\n\nbody\n");
    expect(editor.getFrontmatter()).toBe("x: 1");
    editor.destroy();
  });
});

describe("frontmatter exportHTML", () => {
  it("strips frontmatter from the exported HTML", () => {
    const { editor } = createWithDoc("---\ntitle: T\n---\n\n# Hello\n\nWorld para\n");
    const html = editor.exportHTML();
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World para</p>");
    expect(html).not.toContain("title");
    expect(html).not.toContain("<hr");
    editor.destroy();
  });

  it("does not leak markdown-looking frontmatter body lines into the HTML", () => {
    const { editor } = createWithDoc("---\n# fake\n- item\n---\nreal\n");
    const html = editor.exportHTML();
    expect(html).not.toContain("fake");
    expect(html).not.toContain("<li>");
    expect(html).toContain("<p>real</p>");
    editor.destroy();
  });

  it("exports an empty string for a document that is all unclosed frontmatter", () => {
    const { editor } = createWithDoc("---\na: 1\nb: 2");
    expect(editor.exportHTML().trim()).toBe("");
    editor.destroy();
  });

  it("lets host remarkPlugins observe the yaml node", () => {
    const seen: string[] = [];
    const capture: Plugin<[], Root, Root> = () => (tree) => {
      for (const child of tree.children) seen.push(child.type);
    };
    const { editor } = createWithDoc("---\ntitle: T\n---\n\nbody\n", [
      { name: "capture", remarkPlugins: [capture] },
    ]);
    editor.exportHTML();
    expect(seen[0]).toBe("yaml");
    editor.destroy();
  });
});

describe("frontmatter live preview", () => {
  const source = "---\ntitle: Hello\n---\n\nBody text\n";

  it("shows raw source while the cursor is inside the block", () => {
    const { editor, container } = createWithDoc(source);
    editor.setSelection(2);
    expect(container.textContent).toContain("title: Hello");
    expect(container.textContent).not.toContain("frontmatter");
    editor.destroy();
  });

  it("folds the block into a chip while the cursor is outside", () => {
    const { editor, container } = createWithDoc(source);
    editor.setSelection(source.length);
    expect(container.textContent).toContain("frontmatter");
    expect(container.textContent).not.toContain("title: Hello");
    expect(container.textContent).toContain("Body text");
    editor.destroy();
  });

  it("reveals the raw source when the chip is clicked", () => {
    const { editor, container } = createWithDoc(source);
    editor.setSelection(source.length);

    const chip = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "··· frontmatter"
    );
    expect(chip).toBeDefined();
    chip!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(editor.getSelection().anchor).toBe(0);
    expect(container.textContent).toContain("title: Hello");
    editor.destroy();
  });

  it("tracks edits to the frontmatter body", () => {
    const { editor, container } = createWithDoc(source);
    editor.setSelection(source.length);
    expect(container.textContent).toContain("frontmatter");

    editor.replaceRange(11, 16, "World");
    expect(editor.getFrontmatter()).toBe("title: World");
    editor.setSelection(2);
    expect(container.textContent).toContain("title: World");
    editor.destroy();
  });
});
