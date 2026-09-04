<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NotASprint — agent notes

- `pnpm dev` — dev server. `pnpm build` must stay clean (`main` is deployable). If `pnpm` is not installed, `npx -y pnpm@10.30.3 <cmd>` runs the pinned version.
- `pnpm check` — replays the P0 demo flow, the design-inspiration checks (archetype ids, alias resolution, tool exposure, 144 archetype × scope × intensity applications, lock preservation, undo, export), simulation checks (lap path exactness, seeded determinism, read-only, sane signals, a redesign fixture that must improve), brief evaluation and version save/restore/compare/round-trip — through the WebMCP tool executors in node (run after touching `src/lib/*`).
- `pnpm e2e [url]` — drives local Chrome (`--enable-features=WebMCP`) through the same flow against a running server; fails on any console error. Pass the URL if port 3000 is taken (`pnpm dev --port 3411` then `pnpm e2e http://localhost:3411`).
- `pnpm preview` — prints analysis for every reference circuit and writes `/tmp/notasprint-<id>.svg` previews (use when tuning layouts in `src/lib/circuits.ts`).
- `design.md` is the visual source of truth. Check UI changes against it. Oxanium (`.track`) is only for annotations drawn on the canvas; panel and bars keep Geist / Geist Mono / Barlow.
- UI controls are shadcn/ui (Radix, `components.json` style `radix-nova`) in `src/components/ui`, restyled to the NotASprint tokens — edit those files, never re-run `shadcn add` over them. shadcn's semantic tokens (`--primary`, `--border`, …) are aliased onto `--fg`, `--line`, … in `globals.css`; `--accent` stays racing red and is *not* shadcn's hover token, so never use `bg-accent` for hover. Base rules live in `@layer base` and the type helpers (`.mono .display .label .track .chip`) in `@layer components` so Tailwind utilities can override them. Panel sections are the `Section` collapsible in `Panel.tsx` (`summary` shows while collapsed, `flag` is always-visible red, `autoOpen` surfaces agent-produced content). `pnpm e2e` asserts on rendered text (`DESIGN LOOP`, `held up`, `T7 · PASS`, `.chip`, `.turn-handle`, `.sim-car`) — keep those strings and class names.
- All circuit mutations go through `src/lib/moves.ts`; locks are enforced there, never in callers. Design inspirations are applied by `applyInspiration`, which only composes those primitives.
- `src/lib/archetypes.ts` is the single source for the three design inspirations (ids are part of the tool contract: `high-speed`, `street-technical`, `flowing-technical`). UI copy, tool descriptions and tests read from it — never duplicate the strings.
- Motorsports: `src/lib/series.ts` is the single table for Formula 1 / Formula E / MotoGP (ids `f1`, `fe`, `motogp` are part of the tool contract): vehicle model, score thresholds, length bands, generator parameters, nouns. `Circuit.series` decides the vehicle the analysis and simulation use — F1 numbers are unchanged from before, so seeds and fixtures still hold. Never hard-code `car` in copy; read `seriesById(c.series).noun`.
- Reference Library: `REFERENCES` in `circuits.ts` (three per series, each with `location` and three `character` words) drives the modal, the tools and the checks; `silver-fields` stays the default workspace and is not a library entry. Layouts are hand-drawn schematics — `scale()` brings a sketch to real-world lap length. New layouts must pass the full inspiration matrix without "clamped" warnings (`pnpm check`).
- Custom concepts: `generate.ts` — star-shaped polygon (never self-crossing) with bays, discipline radii, fitted by the fillet geometry, scaled to the series band; deterministic per seed. `loadCustom(series, seed?)` in the store; `create_custom_circuit` tool.
- Exports: `export.ts` builds SVG in four styles; `svgToPng` rasterises in the browser only. `exportDrawing` in `tools.ts` is the one path both the dialog and the tool use.
- Domain modules are pure and React-free: `simulation.ts` (seeded race-flow run; `simulate()` never mutates the circuit and must stay deterministic for a seed — tests depend on seeds 1 and 7 on Silver Fields), `constraints.ts` (brief evaluation), `versions.ts` (snapshots and comparison). Components render and dispatch store actions; tools call the same store actions. `speedProfile()` and `lapPath()` in `circuit.ts` are the only geometry the simulation reads.
- Playback state (`src/lib/playback.ts`) is deliberately outside the design store so per-frame ticks re-render only `SimCars`. Do not put `t` in the main store.
- Simulation wording: "simulated design signal", "held up", "passes", "simulated contact". Never "crash", "safety" or "certified". Frames (`result.frames`) are playback-only and never serialised; `compactResult()` is what tools and versions carry.
- Persistence is `localStorage` key `notasprint.studio.v1` (brief + versions without analysis/frames), hydrated in an effect after mount. Never read it during render or module init.
