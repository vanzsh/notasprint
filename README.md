# NotASprint — Circuit Design Lab

A WebMCP-native workspace where a human and an AI agent design the **same Formula-style racing circuit in the same live browser tab**.

**Live:** https://notasprint-vans-team.vercel.app

The agent doesn't get a chatbot bolted onto the side. It gets the same product state you do: it reads the circuit, reshapes sectors, creates braking zones — and when you drag a corner and lock it, the agent sees that decision and designs around it.

## The interaction

1. Open the app in the ChatGPT desktop app's in-app browser (or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`).
2. Ask: *"Make this circuit more raceable. Give me at least three strong overtaking opportunities, make Sector 3 faster, and keep the circuit below 6 km."*
   The track changes. The analysis changes with it. A one-line receipt says what moved.
3. Drag Turn 7 somewhere you like. Press `L` to lock it.
4. Ask: *"I prefer my new Turn 7. Keep it exactly where it is and make the rest of Sector 2 more technical around it."*
   The agent reads the new live state, sees the lock, and works around your decision. Any attempt to touch a locked turn is refused by the app itself.
5. Ask for a character instead of a metric: *"Give Sector 3 more flowing technical character"* or *"Move Sector 2 toward the high-speed profile without changing Turn 7."*
   The agent applies a design inspiration — linked esses, or opened radii with a heavy braking zone — still around your lock.
6. Export JSON or SVG — from the toolbar or by asking.

## Why WebMCP

Circuit design is spatial, iterative and opinionated. A human is good at *"this corner, here, keep it"*. An agent is good at *"three overtaking zones, faster Sector 3, under 6 km"*. WebMCP lets both operate on one source of truth with zero backend: the page registers tools on `document.modelContext`, the agent calls them, the UI updates instantly, and locks made with a keystroke are enforced in the same function the agent's tools route through.

## Design inspiration

Three named design archetypes describe *characteristics*, never places. They are structured data (`src/lib/archetypes.ts`) shared by the panel, the WebMCP tools and the move engine, so a human and an agent mean the same thing by them.

| Archetype | Character | Applying it |
|---|---|---|
| `high-speed` | Long straights · Heavy braking · Low corner density | Opens radii around the existing braking zones, drops shallow kinks, and makes the corner after the longest approach a heavy braking zone |
| `street-technical` | Tight radii · Dense sequences · Short straights | Tightens radii and inserts a tight chicane on the longest straight |
| `flowing-technical` | Linked corners · Esses · Rhythm | Pulls radii into the 70–140 m band and inserts gentle linked esses on the longest straight |

Reference phrases such as "Monza-style", "street circuit" or "Suzuka-style flow" resolve to an archetype's characteristics — they never load or reproduce a real-world layout. A profile can be applied to one sector or the whole circuit, from the panel or by the agent; locked turns are designed around, and the start/finish straight is kept. The reference layouts remain example starting points: Temple of Speed (high-speed), Street Crown (street), Figure Eight (flowing), Silver Fields (mixed).

## Design → simulate → diagnose → redesign → compare

Three connected systems turn the editor into an iteration studio. All three read the same live circuit; none of them adds a backend.

**Design brief** — a compact set of measurable constraints evaluated continuously against the live circuit: length range, maximum turns, minimum strong overtaking zones, minimum main straight, a target inspiration profile and turns that must stay locked. Each shows `PASS`, `NEAR LIMIT` or `FAIL`. Every write the agent makes returns the brief status, so a redesign that breaks the 5.8 km limit is visible in the same response.

**Simulation** — a hypothetical race-flow run (default 12 cars, 5 laps) of point-mass cars on the circuit's own speed profile, with driver variance, following distance, overtaking attempts in braking zones and occasional contact. Cars move on the real centreline; the output is a set of *simulated design signals*: where cars bunch and stay stuck, where they pass, where speed differentials pile up, which overtaking zones only work on paper. Deterministic for a seed, ~20 ms a run. Not a lap-time, safety or real-racing prediction.

**Versions** — named milestones (V1 Initial concept → V2 Flowing Sector 3 → V3 Simulation optimised) that snapshot circuit, analysis, brief and the latest simulation. Compare any version with the current design: metrics, sector character, brief status, simulation totals, and a dashed overlay on the canvas. Restore is an ordinary undoable edit; undo/redo stays separate for small changes. Versions and the brief survive a refresh via `localStorage`.

Together: *"Run a simulation and improve the worst congestion area without changing Turn 7."* → the agent runs it, reads "Repeated bunching before Turn 3", sees Turn 7 is locked, redesigns around it, re-runs with the same seed and reports `Congestion 96 → 74 · Strong zones 1 → 2`.

## Tool surface

Tools describe motorsport intent, not mouse clicks.

| Tool | Purpose |
|---|---|
| `get_circuit` | Live state: every turn (position, radius, sector, apex/entry speed, braking drop, approach straight, overtaking score, lock), sectors, scores, warnings, the design brief status, a compact view of the latest simulation, the latest version, the design inspirations and reference layouts |
| `analyze_circuit` | Design analysis with explanations, overtaking candidates, guidance, the brief per constraint, the latest simulation's full per-turn signals and findings, and each inspiration's traits, aliases, effect and score tendencies |
| `apply_design_move` | `tighten_turn` · `open_turn` · `create_overtaking_zone` · `add_chicane_after` · `add_esses_after` · `add_hairpin_after` · `remove_turn` |
| `reshape_sector` | `faster` · `more_technical` · `more_overtaking`, or a design `inspiration`, for a whole sector |
| `apply_design_inspiration` | `high-speed` · `street-technical` · `flowing-technical` for the whole circuit or one sector |
| `edit_turns` | Precise position / radius / name edits |
| `set_turn_locks` | Protect design decisions |
| `load_reference_circuit` | Silver Fields · Temple of Speed · Street Crown · Figure Eight |
| `undo_changes` | Step back through shared history |
| `run_simulation` | Race-flow simulation on the live circuit: totals, per-turn signals, ranked findings, and before/after against the previous run |
| `set_design_brief` | Set, change or clear constraints; `null` removes one |
| `design_versions` | `list` · `save` · `restore` · `compare` named milestones |
| `export_circuit` | JSON (definition + analysis) or SVG |

Every write tool returns a receipt plus the full new state and the brief's PASS/FAIL status, and flags when the last simulation predates the change, so the agent rarely needs a second round trip.

## Circuit intelligence

Deterministic and explainable. A circuit is a closed polygon of turns with filleted corners. A point-mass speed profile (grip-limited apex speed, acceleration and braking limits) gives lap time, braking zones and sector character. From that:

- **Overtaking** — heavy braking after a long approach; a turn scores ≥70 when the drop is ≳120 km/h after ≳400 m
- **Flow** — share of fast corners and low average braking drop
- **Technicality** — corner density and share of slow corners
- **High-speed** — share of the lap above 250 km/h

Change the circuit and you can see *why* the numbers moved.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · SVG. No backend, no database, no accounts, no external AI API. Deployed on Vercel.

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm check      # P0 flow, inspirations, simulation determinism and redesign fixture, brief, versions — through the tool executors in node
pnpm e2e [url]  # drives local Chrome with WebMCP enabled through the same flow
```

Visual language lives in [`design.md`](./design.md): Geist, Geist Mono and Barlow Condensed for the product UI, Oxanium for annotations drawn on the circuit itself. Layouts are original; names are nods to motorsport archetypes, not traces of real circuits.

## License

MIT
