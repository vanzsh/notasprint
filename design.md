# NotASprint — Design Language

Visual source of truth. Every screen, component and refinement pass is checked against this file.

Personality: **race engineering × premium motorsport editorial × precision design tool.**
Not gaming UI. Not an F1 clone. A serious instrument a circuit designer would keep open all day.

## 1. Foundation

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0A` | Page / canvas background |
| `--surface` | `#111111` | Panels, bars |
| `--surface-2` | `#171717` | Hover rows, inputs, elevated chips |
| `--line` | `#232323` | Hairline borders, grid, dividers |
| `--line-strong` | `#3A3A3A` | Active borders, slider tracks |
| `--fg` | `#F2F0EB` | Primary text (warm off-white) |
| `--fg-muted` | `#8A8A8A` | Secondary labels, units |
| `--fg-dim` | `#5A5A5A` | Tertiary, disabled, grid labels |
| `--accent` | `#FF3045` | Selection, locks, overtaking markers, the single red moment on screen |
| `--accent-dim` | `rgba(255,48,69,0.18)` | Accent fills, highlights |
| `--asphalt` | `#2A2A2A` | Track surface |
| `--asphalt-edge` | `#D9D6CF` | Track edge lines |

Rules
- Red is a **signal**, never decoration. At most one category of thing on screen is red at a time (selection, lock, or agent change flash). Never red buttons for routine actions.
- No gradients except a single 1px-to-transparent rule if a divider needs to fade.
- No box shadows. Depth comes from `--surface` steps and hairlines.
- Border radius: one value, `--radius: 2px`, for every control (buttons, fields, selects, menus, tooltips, chips). Panels, bars and section headers are square. Turn markers are circles because they are geometry, not UI.
- Components are shadcn/ui (Radix) primitives in `src/components/ui`, restyled to these tokens. shadcn is infrastructure; nothing may look like its defaults (no `rounded-lg`, rings, shadows or zoom-in menus).

## 2. Typography

| Role | Face | Notes |
|---|---|---|
| Display / wordmark / panel sector headings / big telemetry numbers | **Barlow Condensed** 600–700, uppercase, `letter-spacing: 0.02em` | The racing/editorial voice. Use sparingly: wordmark, hero metrics, section headings, archetype names. |
| Product UI | **Geist** 400/500 | Buttons, body, inspector labels |
| Telemetry / data in the panel | **Geist Mono** 400/500 | Every number that changes: lengths, speeds, coordinates, times, scores. Tabular figures. |
| Circuit annotations on the canvas | **Oxanium** 500/600 (`--font-oxanium`, class `.track`) | Anything drawn spatially on or around the track: turn numbers, turn names, `S1 / S2 / S3` marks, `S/F`, grid legend, on-track speed or braking values. |

Two typography systems, one rule: **product UI** (bars, panel, inspector, exports list) uses Geist / Geist Mono / Barlow Condensed; **the circuit itself** (SVG canvas annotations) uses Oxanium. Oxanium never appears in panel text, buttons or chips; the panel's speed-trace labels are panel telemetry and stay Geist Mono. Weights: 500 for ordinary labels (`S/F`, names, grid legend), 600 for spatial identifiers (turn numbers, sector marks), 700 only for a stronger marker if one is ever needed. Sizes stay small (10–12px at screen scale); Oxanium is wide, so never let it grow into display type.

Scale (px): `11 · 12 · 13 · 15 · 20 · 28 · 44 · 64`
- Labels: 11px Geist, uppercase, `letter-spacing: 0.08em`, `--fg-muted`.
- Hero number: 36px Barlow Condensed in the panel (44–64px only if a metric ever gets a full-width stage), tight line-height (0.95), unit in 11px mono muted beside it.
- Never center-align paragraphs. Numbers right-align in tables.

## 3. Layout

Single-screen workstation. No scroll on the main page at ≥1280px.

```
┌──────────────────────────────────────────────┬──────────────┐
│ top bar 48px: wordmark · circuit · undo · export · agent    │
├──────────────────────────────────────────────┬──────────────┤
│                                              │ analysis     │
│            circuit canvas  (~75%)            │ panel (~25%) │
│                                              │ min 320px    │
│                                              │ max 400px    │
└──────────────────────────────────────────────┴──────────────┘
```

- The circuit is the hero. The canvas gets every pixel not needed by the panel.
- Panel is a telemetry stack: collapsible sections separated by hairlines. Each header is 32px — chevron, 11px uppercase label, and a right-aligned mono **readout** that shows while collapsed (`OVERTAKING  3 strong`, `SPEED TRACE  338 km/h max`) so a closed stack still reads as instruments. Signals (`2 FAILING`, `STALE`, `1 WARNING`) stay visible in `--accent` even when open. Sections, in order: Circuit · Design scores · Design loop / Selected turn · Sectors · Overtaking · Speed trace · Design inspiration · Design brief · Simulation · Versions · Geometry warnings · Activity (pinned at the bottom). Read → analyse → design → validate.
- Default state: Circuit, Design scores and the turn / design-loop section open; everything else collapsed. A section opens itself when content arrives (a brief set by the agent, a simulation run, a saved version) unless the designer has toggled it by hand. Selecting a turn always opens its section.
- "Constraints" always means the design brief; geometry problems are "warnings".
- Top bar reads left to right: wordmark · `Reference` + layout select · Undo/Redo icon pair · agent chip · `Export` menu (JSON / SVG). "Reference" is always the word for a starting layout; "Design inspiration" is always the word for a character applied to the live circuit. Never blur the two.
- Terminology carries a tooltip (350ms delay, one sentence): scores, hero metrics, apex / entry / approach / braking, simulation parameters, the reference label. Labels stay terse because the definition is one hover away.
- Spacing grid: 4px. Common paddings: 12 / 16 / 24. Section gap 20.
- Considerable negative space inside the canvas: fit the circuit with ~12% margin.

## 4. Canvas

- Background `--bg` with a 100 m technical grid in `--line` at 1px (scaled), major every 500 m slightly stronger. Never a texture.
- Track: `--asphalt` surface at real track width, `--asphalt-edge` 0.6 m edge lines at 70% opacity. Centerline: none (keep asphalt clean).
- Start/finish: a short perpendicular bar in `--fg` with an "S/F" label, 10px Oxanium 500, `--fg-muted`.
- Turn markers: 2.4 m circle, `--fg` stroke, `--bg` fill. Number in 11px Oxanium 600 beside the marker, outside the corner.
- Selected turn: marker fills `--accent`; number turns `--accent`; the turn's name (if any) appears in 10px Oxanium 500 `--fg-muted`, stacked on the side of the number that faces away from the asphalt.
- Locked turn: marker gets a second ring in `--accent`, label prefixed with a small lock glyph. Locked turns cannot be dragged and the cursor says so.
- Sector boundaries: a 12 m tick across the track and an `S2` / `S3` label in 12px Oxanium 600, `--fg-dim`.
- Grid legend (`GRID 100 m · N ↑`): 11px Oxanium 500, `--fg-dim`, bottom-left.
- Simulated cars: 3px circles, `--fg` fill, 1px `--bg` stroke, no numbers, no trails, no colour coding. They exist only while the run matches the live geometry; edit a turn and they are gone, the panel says why. Lap telemetry (`SIM LAP 3/5 · 12 CARS · 8×`) is 11px Oxanium 500 `--fg-dim`, bottom-right. Nothing else moves on the canvas during playback.
- Compare version: the other version's centreline as a dashed `--fg-muted` hairline (1.4px, 7/5 dash) over the asphalt, with a legend top-right in 11px Oxanium: `CURRENT ▬   V2 · NAME ┄`. One overlay at a time; no fills, no second set of turn markers.
- Overtaking opportunity: a tiny `--accent` chevron ▸ before the turn number, nothing more.
- Agent change: changed elements flash `--accent-dim` for ~900ms, then settle. No spinners, no "agent is thinking".

## 5. Motion

- Durations: 120ms for hover/press, 160ms open / 120ms close for collapsibles (height + opacity, chevron rotates), 120ms fade for menus and tooltips, 240ms for panel value changes, 600–900ms for agent change flashes. `prefers-reduced-motion` collapses everything to 1ms.
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Numbers that change (length, scores) tween color from `--accent` back to `--fg` over 600ms — not a count-up animation.
- Track geometry changes are instant. The eye tracks the flash, not a morph.

## 6. Components

- **Button** (`ui/button`): one family, four variants. `secondary` (default): `--surface-2` bg, `--line` border, `--fg`, hover `--line-strong` border. `primary`: `--fg` bg, `--bg` text — at most one on screen, and only for an action that produces something (`Run simulation`); the top bar has none so the circuit stays the brightest thing. `ghost`: borderless, `--fg-muted` → `--fg`, `--surface-2` on hover; for icon-only utilities (remove, delete). `link`: inline underlined text (Undo, Compare, Restore, Clear, Close). Sizes: default 28px / 12px, `sm` 24px / 11px, `icon` 28px, `icon-sm` 24px. Selected state is `data-on` — `--accent` border and text (a lock that is on) or `--fg` (a version being compared). Disabled: `--fg-dim` text, `--line` border. Adjoining buttons (Undo/Redo, Apply to S1 S2 S3 Circuit) share edges: `-ml-px`, outer corners only. No red buttons.
- **Icons**: Lucide, 14px inside controls, 12px as chevrons. Only on icon-only buttons, the section chevron, and the export trigger. Never decorate labels with icons.
- **Select** (`ui/select`): trigger styled as a secondary button (28px, or 24px `sm` in dense rows) with a 12px chevron; menu is `--surface` with a `--line-strong` hairline, 24px items, checked item in `--fg`, others `--fg-muted`.
- **Menu / Tooltip**: `--surface` with `--line-strong` border, 2px radius, no arrow, no shadow. Tooltip text 11px Geist, max 260px, `<kbd>` in mono dim.
- **Chip / status**: 20px tall, 11px mono uppercase, hairline border. Agent-connected chip has a 6px `--fg` dot; disconnected is `--fg-dim`.
- **Slider** (`ui/slider`): 1px `--line-strong` track, `--fg-muted` range, 10px square `--fg` thumb. Live preview while scrubbing, one history entry on release.
- **Checkbox** (`ui/checkbox`): 11px square, `--line-strong` border, `--fg` fill when on, no glyph.
- **Field** (`ui/input`): 28px, `--surface-2`, `--line` border, focus `--line-strong`. Number fields are mono, 24px, no spinner.
- **Metric**: 10px uppercase `--fg-dim` label over a 12px mono value with its unit in `--fg-dim` (`338 km/h`). Used for secondary circuit metrics and the turn inspector grid. A metric that is itself a signal (overtaking ≥ 70) may be `--accent`.
- **Turn inspector**: headline in 15px Barlow (`SLOW · RIGHT 82°`) with sector and position right-aligned in mono, a 3 × 2 metric grid between hairlines (Apex · Entry · Approach / Braking · Overtaking · Radius), the radius slider, the name field, then `Lock L` · `Add turn after` · a ghost remove icon.
- **Speed trace**: 320 × 56 SVG, hairline grid at 100 / 200 / 300 km/h with 9px mono axis labels, dashed sector boundaries with `S2 / S3` beneath, `--fg` 1.2px line. Hover draws a `--fg-muted` crosshair, an `--accent` dot and a mono readout (`2400 m · 191 km/h · S2`). It is panel telemetry, so Geist Mono, not Oxanium.
- **Score**: label + 28px Barlow number + 2px bar underneath (`--line` track, `--fg` fill; `--accent` fill only while it was just changed by the agent).
- **Receipt**: single line mono, `--fg-muted`: `4 elements changed · Flow 74 → 83 · Undo`. Undo is an inline text button.
- **Inspiration row** (Design inspiration section): archetype name in 15px Barlow, `--fg-muted` (`--fg` when open), with its three headline traits beneath in 11px mono `--fg-dim`, e.g. `HIGH-SPEED / Long straights · Heavy braking · Low corner density`. Rows are hairline-separated and act as an accordion, one open at a time. The open row shows the full trait list (11px mono muted), one example agent request in quotes, and an `Apply to  S1 S2 S3 Circuit` button row. No cards, no icons, no imagery. Failures ("every turn in Sector 2 is locked") appear beneath as a `!`-prefixed mono line, never as a modal.
- **Design loop** (empty selection state of the turn section): one Barlow line `DRAG → LOCK → ASK AGENT → CONTINUE`, four single-line mono steps with the verb in `--fg`, then a `--fg-dim` line stating the agent status and that tool calls edit *this live circuit*. It disappears as soon as a turn is selected. Never a modal, tour or gate.
- **Brief row**: an 11px square checkbox (`--fg` fill when on), a 104px mono label, the bound inputs (24px `.field` number inputs, mono), then right-aligned the live value in `--fg-muted` and the status word — `PASS` in `--fg`, `NEAR LIMIT` in `--fg-muted`, `FAIL` in `--accent`. Preserved turns are chips (`T7 · PASS ×`). One line per constraint; the footer reads `5/7 pass · 2 failing`. No progress bars, no traffic-light icons.
- **Simulation controls**: a 2 × 2 grid of 24px selects with self-describing options (`12 cars`, `5 laps`, `Moderate variance`), one primary `Run simulation` button with the playback icon button (play / pause / replay) beside it and the seed right-aligned in dim mono. Results are a five-column totals strip between hairlines (mono value over a lowercase caption: `60` / `held up`), one `Previous → this` line, then up to five findings as `!`-prefixed rows (`--accent` for high severity, `--fg` for medium, `·` `--fg-dim` for info); clicking a finding selects the turn. A dim footnote says "simulated design signal". Never a HUD, timer bar or leaderboard.
- **Version row**: version id in 15px Barlow (`V2`), name in mono, then `Compare` / `Restore` as link buttons and a ghost `×`; a second dim mono line with length, turns, strong zones and whether a simulation is attached. The row being compared sits on `--surface-2`. The comparison is a three-column mono table (`label · a → b`) with changed values in `--fg`, unchanged in `--fg-muted`; sector rows appear only when the character changed.

## 7. Voice

Short, technical, confident. Labels use motorsport vocabulary: Turn, Sector, Apex, Braking zone, Straight, Track width. Never "AI magic", never exclamation marks. Numbers carry units always (`km`, `m`, `km/h`).

Design inspirations are described as characteristics ("long straights, heavy braking"), never as places. Reference phrases such as "Monza-style" may appear as aliases in tool output for an agent's benefit; the UI itself names only the archetype (High-Speed · Street / Technical · Flowing / Technical). No real-world circuit names, logos, liveries or series branding anywhere in the product.

Simulation output is always a **simulated design signal**, **hypothetical finding** or **simulation result** — "repeated bunching", "held up", "simulated contact", "passes". Never "crash", "accident", "safety", "risk", "certified" or any word that implies a real-world or regulatory claim. Brief statuses are design checks (`PASS · NEAR LIMIT · FAIL`), not compliance.

## 8. Anti-patterns (never)

Carbon fiber · checkered flags · tachometers · glows · glassmorphism · rounded SaaS cards · drop shadows · rainbow speed gradients · loading theater · F1 logos or typography · broadcast overlays · 3D or sprite cars · game HUDs, leaderboards or lap timers · particle or skid effects · colour-coded car liveries.
