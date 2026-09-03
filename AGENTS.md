<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NotASprint — agent notes

- `pnpm dev` — dev server. `pnpm build` must stay clean (`main` is deployable).
- `pnpm check` — replays the P0 demo flow through the WebMCP tool executors in node (run after touching `src/lib/*`).
- `pnpm e2e [url]` — drives local Chrome (`--enable-features=WebMCP`) through the same flow against a running server; fails on any console error.
- `pnpm preview` — prints analysis for every reference circuit and writes `/tmp/notasprint-<id>.svg` previews (use when tuning layouts in `src/lib/circuits.ts`).
- `design.md` is the visual source of truth. Check UI changes against it.
- All circuit mutations go through `src/lib/moves.ts`; locks are enforced there, never in callers.
