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
5. Export JSON or SVG — from the toolbar or by asking.

## Why WebMCP

Circuit design is spatial, iterative and opinionated. A human is good at *"this corner, here, keep it"*. An agent is good at *"three overtaking zones, faster Sector 3, under 6 km"*. WebMCP lets both operate on one source of truth with zero backend: the page registers tools on `document.modelContext`, the agent calls them, the UI updates instantly, and locks made with a keystroke are enforced in the same function the agent's tools route through.

## Tool surface

Tools describe motorsport intent, not mouse clicks.

| Tool | Purpose |
|---|---|
| `get_circuit` | Live state: every turn (position, radius, sector, apex/entry speed, braking drop, approach straight, overtaking score, lock), sectors, scores, warnings |
| `analyze_circuit` | Design analysis with explanations, overtaking candidates and guidance |
| `apply_design_move` | `tighten_turn` · `open_turn` · `create_overtaking_zone` · `add_chicane_after` · `add_esses_after` · `add_hairpin_after` · `remove_turn` |
| `reshape_sector` | `faster` · `more_technical` · `more_overtaking` for a whole sector |
| `edit_turns` | Precise position / radius / name edits |
| `set_turn_locks` | Protect design decisions |
| `load_reference_circuit` | Silver Fields · Temple of Speed · Street Crown · Figure Eight |
| `undo_changes` | Step back through shared history |
| `export_circuit` | JSON (definition + analysis) or SVG |

Every write tool returns a receipt plus the full new state, so the agent rarely needs a second round trip.

## Circuit intelligence

Deterministic, explainable, not a race simulation. A circuit is a closed polygon of turns with filleted corners. A point-mass speed profile (grip-limited apex speed, acceleration and braking limits) gives lap time, braking zones and sector character. From that:

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
pnpm check      # replays the P0 flow through the tool executors in node
pnpm e2e [url]  # drives local Chrome with WebMCP enabled through the same flow
```

Visual language lives in [`design.md`](./design.md). Layouts are original; names are nods to motorsport archetypes, not traces of real circuits.

## License

MIT
