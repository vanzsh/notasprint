# NotASprint — agent notes

- `pnpm dev` — dev server. `pnpm build` must stay clean (`main` is deployable).
- `pnpm check` — replays the P0 demo flow through the WebMCP tool executors in node (run after touching `src/lib/*`).
- `pnpm e2e [url]` — drives local Chrome (`--enable-features=WebMCP`) through the same flow against a running server; fails on any console error.
- `pnpm preview` — prints analysis for every reference circuit and writes `/tmp/notasprint-<id>.svg` previews (use when tuning layouts in `src/lib/circuits.ts`).
- `design.md` is the visual source of truth. Check UI changes against it.
- All circuit mutations go through `src/lib/moves.ts`; locks are enforced there, never in callers.
