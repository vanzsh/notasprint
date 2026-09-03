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
- Border radius: `0` for panels, bars, buttons; `2px` max for chips/inputs. Turn markers are circles because they are geometry, not UI.

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
- Hero number: 44–64px Barlow Condensed, tight line-height (0.95), unit in 12px mono muted beside it.
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
- Panel is a vertical stack of sections separated by hairlines, each with an 11px uppercase label. Sections, in order: Circuit · Design scores · Design loop / Selected turn · Design inspiration · Sectors · Overtaking · Speed trace · Constraints · Activity (pinned at the bottom).
- Top bar reads left to right: wordmark · `Reference` + layout select · Undo/Redo · agent chip · exports. "Reference" is always the word for a starting layout; "Design inspiration" is always the word for a character applied to the live circuit. Never blur the two.
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
- Overtaking opportunity: a tiny `--accent` chevron ▸ before the turn number, nothing more.
- Agent change: changed elements flash `--accent-dim` for ~900ms, then settle. No spinners, no "agent is thinking".

## 5. Motion

- Durations: 120ms for hover/press, 240ms for panel value changes, 600–900ms for agent change flashes.
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Numbers that change (length, scores) tween color from `--accent` back to `--fg` over 600ms — not a count-up animation.
- Track geometry changes are instant. The eye tracks the flash, not a morph.

## 6. Components

- **Button**: 28px tall, 12px Geist 500, `--surface-2` bg, `--line` border, `--fg`. Hover: `--line-strong` border. Primary variant: `--fg` bg, `--bg` text. No red buttons.
- **Chip / status**: 20px tall, 11px mono uppercase, hairline border. Agent-connected chip has a 6px `--fg` dot; disconnected is `--fg-dim`.
- **Slider**: 1px `--line-strong` track, 10px square `--fg` thumb.
- **Score**: label + 28px Barlow number + 2px bar underneath (`--line` track, `--fg` fill; `--accent` fill only while it was just changed by the agent).
- **Receipt**: single line mono, `--fg-muted`: `4 elements changed · Flow 74 → 83 · Undo`. Undo is an inline text button.
- **Inspiration row** (Design inspiration section): archetype name in 15px Barlow, `--fg-muted` (`--fg` when open), with its three headline traits beneath in 11px mono `--fg-dim`, e.g. `HIGH-SPEED / Long straights · Heavy braking · Low corner density`. Rows are hairline-separated and act as an accordion, one open at a time. The open row shows the full trait list (11px mono muted), one example agent request in quotes, and an `Apply to  S1 S2 S3 Circuit` button row. No cards, no icons, no imagery. Failures ("every turn in Sector 2 is locked") appear beneath as a `!`-prefixed mono line, never as a modal.
- **Design loop** (empty selection state of the turn section): one Barlow line `DRAG → LOCK → ASK AGENT → CONTINUE`, four single-line mono steps with the verb in `--fg`, then a `--fg-dim` line stating the agent status and that tool calls edit *this live circuit*. It disappears as soon as a turn is selected. Never a modal, tour or gate.

## 7. Voice

Short, technical, confident. Labels use motorsport vocabulary: Turn, Sector, Apex, Braking zone, Straight, Track width. Never "AI magic", never exclamation marks. Numbers carry units always (`km`, `m`, `km/h`).

Design inspirations are described as characteristics ("long straights, heavy braking"), never as places. Reference phrases such as "Monza-style" may appear as aliases in tool output for an agent's benefit; the UI itself names only the archetype (High-Speed · Street / Technical · Flowing / Technical). No real-world circuit names, logos, liveries or series branding anywhere in the product.

## 8. Anti-patterns (never)

Carbon fiber · checkered flags · tachometers · glows · glassmorphism · rounded SaaS cards · drop shadows · rainbow speed gradients · loading theater · F1 logos or typography · broadcast overlays.
