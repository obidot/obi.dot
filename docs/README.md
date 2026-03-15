# docs — Obidot Documentation Site

Next.js 15 documentation site built with [Fumadocs](https://fumadocs.dev). Covers the Obidot protocol — smart contracts, SDK, indexer, and agent.

## Quick Start

```bash
pnpm install
pnpm dev    # http://localhost:3001
```

## Structure

```
docs/
├── app/
│   ├── (home)/          # Landing page
│   └── docs/            # Documentation layout + pages
├── content/docs/        # MDX documentation files
├── lib/
│   ├── source.ts        # Fumadocs content source adapter
│   └── layout.shared.tsx
└── source.config.ts     # Fumadocs MDX config (frontmatter schema)
```

## Writing Docs

Add `.mdx` files to `content/docs/`. Frontmatter:

```mdx
---
title: My Page
description: A short description
---

Content here.
```

Fumadocs automatically generates navigation and search from the file structure.

## Related

- Smart contracts: [obi.router](https://github.com/obidot/obi.router)
- Agent SDK: [obi-kit](https://github.com/obidot/obi-kit)
- Indexer: [obi.index](https://github.com/obidot/obi.index)
