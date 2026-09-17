---
title: Frontmatter Demo
tags:
  - nexus
  - demo
date: 2026-09-17
draft: false
# This comment-looking line lives INSIDE the frontmatter —
# it must NOT appear in the table of contents.
---

# Frontmatter Demo

这份笔记演示 core 的 YAML frontmatter 支持。

## What to look for

1. **Live preview chip** — move the cursor below this line: the whole
   `---` block at the top collapses into a `··· frontmatter` chip.
   Click the chip (or move the caret into the block) to reveal the raw
   YAML again.
2. **TOC isolation** — the `#`-looking comment inside the frontmatter
   body does not show up in the table of contents.
3. **Word count** — the status bar counts only this body text; the
   metadata above contributes zero words.
4. **`editor.getFrontmatter()`** — hosts can read the raw YAML body
   (`title: Frontmatter Demo\ntags: …`) without pulling in a YAML
   parser dependency in core.

## Body content

Everything below the fences is ordinary Markdown, parsed exactly as
before.
