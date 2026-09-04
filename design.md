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

Three roles, roughly 60 / 30 / 10 by area: **Geist** is the everyday UI voice — descriptions, buttons, labels, helper text, findings, menu items, any sentence. **Barlow Condensed** is identity and big numbers. **Geist Mono** is reserved for genuinely technical tokens: measured values with units, timestamps, coordinates, seeds and event ids, tool names, keyboard shortcuts (`<kbd>`). A sentence is never mono because the product is technical; a number is never sans because it sits in a sentence. The result should read as an engineering product, not a terminal.

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
- Top bar is deliberately quiet: wordmark · Undo/Redo icon pair · (right) the current motorsport and circuit in dim sans · agent chip. Nothing else. Reference switching lives in the circuit identity; export, presentation and reset live in the panel's Workspace section. "Reference" is always the word for a starting layout; "Design inspiration" is always the word for a character applied to the live circuit. Never blur the two.
- **Circuit switcher** (top of the Circuit section): the identity *is* the control — one raised `--surface-2` block with a `--line` border and 2px radius holding the 16px series mark, the motorsport as an uppercase label, `Change ⇄` right-aligned in dim, and the circuit name in 26px Barlow beneath. Hover: `--line-strong` border, a slightly lighter surface, a 1px lift, and the label and `Change` brighten to `--fg`. Click opens the Reference Library. Below it, outside the control: the tagline in 12px sans muted, then location · Reference (or Generated concept · `seed N` in mono, with the refresh icon) in dim sans. Then the hero metrics.
- **Workspace section** (last in the stack): three equal buttons — `Export`, `Present`, `Reset` — and one dim sentence. Reset is disabled while the circuit equals its starting layout and always confirms in a dialog (`Reset circuit?` · Cancel · `Reset circuit` in the `destructive` variant: `--accent` border and text, `--accent-dim` on hover — the one place a red control is allowed). The reset itself is an undoable commit.
- **More below**: whenever the rail has content under the fold, a 48px fade from `--surface` and a centred 24px chevron chip mark it. If a flagged section (failing brief, stale simulation, geometry warnings) is out of view, the chip turns `--accent` with `!` (or the count) and clicking jumps to the first flagged section; otherwise it scrolls on by three quarters of the viewport. It disappears at the bottom.
- **Zoom** (top-left of the canvas): `+` · `−` · Fit as one 28px icon stack, zoom shown beneath in 10px mono when not fitted. Range 75–300 %, wheel or pinch zooms about the cursor, the pan is clamped so the circuit never leaves the frame, and a new circuit always opens fitted. Deliberately not a CAD viewport.
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
- Simulated vehicles: small oriented glyphs in curated generic liveries (see § 6), no numbers, no trails. They exist only while the run matches the live geometry; edit a turn and they are gone, the panel says why. Lap telemetry (`SIM LAP 3/5 · 12 CARS · 8×`) is 11px Oxanium 500 `--fg-dim`, bottom-right. Nothing else moves on the canvas during playback.
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
- **Activity** (pinned footer): the last three events, newest first and brightest. A WebMCP call reads `WEBMCP  reshape_sector  SUCCESS  14:47:21  #A72F` — source as an uppercase label, the tool name in mono, the outcome as a label (`REFUSED` in `--accent` when the app rejected it, e.g. a locked turn), the time and a four-hex local event id in dim mono — with the real change summary beneath (`Technical Sector 2 · 7 changed · Flow 63 → 78`). Human edits read `YOU  Moved T7  14:46:10  #9C1E`. Every field is real event data; there is no network origin to show, so none is shown. `Undo last change` is a link button in the header.
- **Inspiration row** (Design inspiration section): archetype name in 15px Barlow, `--fg-muted` (`--fg` when open), with its three headline traits beneath in 11px mono `--fg-dim`, e.g. `HIGH-SPEED / Long straights · Heavy braking · Low corner density`. Rows are hairline-separated and act as an accordion, one open at a time. The open row shows the full trait list (11px mono muted), one example agent request in quotes, and an `Apply to  S1 S2 S3 Circuit` button row. No cards, no icons, no imagery. Failures ("every turn in Sector 2 is locked") appear beneath as a `!`-prefixed mono line, never as a modal.
- **Design loop** (empty selection state of the turn section): one Barlow line `DRAG → LOCK → ASK AGENT → CONTINUE`, four single-line mono steps with the verb in `--fg`, then a `--fg-dim` line stating the agent status and that tool calls edit *this live circuit*. It disappears as soon as a turn is selected. Never a modal, tour or gate.
- **Brief row**: an 11px square checkbox (`--fg` fill when on), a 104px mono label, the bound inputs (24px `.field` number inputs, mono), then right-aligned the live value in `--fg-muted` and the status word — `PASS` in `--fg`, `NEAR LIMIT` in `--fg-muted`, `FAIL` in `--accent`. Preserved turns are chips (`T7 · PASS ×`). One line per constraint; the footer reads `5/7 pass · 2 failing`. No progress bars, no traffic-light icons.
- **Simulation controls**: a 2 × 2 grid of 24px selects with self-describing options (`12 cars` or `12 bikes`, `5 laps`, `Moderate variance`), one primary `Run simulation` button with the playback icon button (play / pause / replay) beside it and the seed right-aligned in dim mono. Results are a five-column totals strip between hairlines (mono value over a lowercase caption: `60` / `held up`), one `Previous → this` line, then up to five findings as `!`-prefixed rows (`--accent` for high severity, `--fg` for medium, `·` `--fg-dim` for info); clicking a finding selects the turn. A dim footnote says "simulated design signal". Never a HUD, timer bar or leaderboard.
- **Version row**: version id in 15px Barlow (`V2`), name in mono, then `Compare` / `Restore` as link buttons and a ghost `×`; a second dim mono line with length, turns, strong zones and whether a simulation is attached. The row being compared sits on `--surface-2`. The comparison is a three-column mono table (`label · a → b`) with changed values in `--fg`, unchanged in `--fg-muted`; sector rows appear only when the character changed.

- **Dialog** (`ui/dialog`): `--surface` panel with a `--line-strong` hairline on a 60 % black scrim, square corners, 120ms fade, no zoom. Header is a 20px Barlow title with a 12px muted description on the same baseline; footer is a hairline-topped strip of 10–11px dim notes. Close is a ghost icon top-right.
- **Reference Library**: 1000 × 700 max. Underline tabs (`ui/tabs`) with the 18px series mark and the discipline name; the vehicle model (`338 km/h · 3.5 g lateral · cars`) sits right in dim mono and the discipline's design emphasis runs beneath as one muted sentence. A 2 × 2 grid: three reference cards and Create custom. **Reference card**: schematic (asphalt + edge lines + S/F tick at constant visual weight), the three character words in 10px uppercase mono bottom-left, then a hairline, the name in 20px Barlow, location muted left and `4.71 km · 9 turns · 1:05.7` mono right. Hover: `--line-strong` border on `--surface-2`; the loaded circuit has a `--fg` border and a `Loaded` chip. **Create custom**: dashed `--line-strong` border, a 36px outlined `+`, "Create custom" in 20px Barlow, one muted sentence and the discipline's length / turn band in dim mono. Picking anything loads and closes; no confirmation.
- **Regenerate**: when the live circuit is a generated concept, a ghost refresh icon sits beside the circuit name in the panel; the Circuit section's origin line reads `MotoGP · Generated concept · seed 101167`. Nothing else in the editor changes.
- **Export dialog**: preview left (the actual SVG on `--bg` inside a hairline), style list right as four bordered rows (name + one-line blurb; the chosen row has a `--fg` border on `--surface-2`), then a 2 × 2 of download buttons: `PNG` primary, `PNG · transparent`, `SVG`, `JSON`. Drawings are 2400px wide. Styles: technical (grid, turn numbers and names, sectors, braking chevrons, scale bar), presentation (name, location, four hero metrics), minimal (asphalt only), analysis (presentation plus scores, sectors and strong braking zones). Every drawing carries "NotASprint · design analysis, not survey data" in dim 10px.
- **Presentation view**: replaces the workspace; the canvas full-bleed with the motorsport and location as a label, the name in 44px Barlow and the tagline top-left; four hero metrics in 44px Barlow bottom-left; the four scores with their 2px bars bottom-right; `Esc to exit` and a single icon button top-right. No panel, no bars, nothing else.
- **Simulated vehicles**: oriented glyphs sized from the discipline's vehicle (5.6 × 2.0 m single-seater with a darker rear-wing bar, 2.1 × 0.7 m motorcycle with a round rider), never smaller than ~12 × 5 px so they read at map scale. Each participant wears one of 24 curated high-contrast liveries — white, red, blue, yellow, green, orange, cyan, magenta, lime, pink in solid / centre stripe / side stripe / two-tone / nose patterns; nothing black, charcoal or dark green that would vanish into the canvas. The livery is fixed for the whole run (participant index + seed) so one car can be followed lap after lap; another run may deal them differently. Generic colour combinations only, never a real team's. Canvas telemetry says `8 BIKES` or `12 CARS`.

## 7. Voice

Short, technical, confident. Labels use motorsport vocabulary: Turn, Sector, Apex, Braking zone, Straight, Track width. Never "AI magic", never exclamation marks. Numbers carry units always (`km`, `m`, `km/h`).

Design inspirations are described as characteristics ("long straights, heavy braking"), never as places. Reference phrases such as "Monza-style" may appear as aliases in tool output for an agent's benefit; the archetype UI names only the archetype (High-Speed · Street / Technical · Flowing / Technical).

Real-world names live in exactly one place: the **Reference Library**, where nine reference layouts carry their official circuit title and city as *schematic interpretations for design inspiration* — the character and rough proportions of the place, never survey geometry, telemetry or official data, and the copy says so. The three series marks are the supplied files, shown unedited at 18px for identification only, with the footer line "For representation purposes only. Not affiliated with or endorsed by the referenced racing series or circuits." No liveries, sponsor graphics or broadcast styling anywhere.

Motorsports are Formula 1, Formula E and MotoGP. The vehicle is a "car" or a "bike"; analysis, warnings and simulation copy use the discipline's word. Numbers describing a discipline are product heuristics ("a point-mass model"), never regulations, homologation or certified performance.

Simulation output is always a **simulated design signal**, **hypothetical finding** or **simulation result** — "repeated bunching", "held up", "simulated contact", "passes". Never "crash", "accident", "safety", "risk", "certified" or any word that implies a real-world or regulatory claim. Brief statuses are design checks (`PASS · NEAR LIMIT · FAIL`), not compliance.

## 8. Anti-patterns (never)

Carbon fiber · checkered flags · tachometers · glows · glassmorphism · rounded SaaS cards · drop shadows · rainbow speed gradients · loading theater · F1 logos or typography · broadcast overlays · 3D or sprite cars · game HUDs, leaderboards or lap timers · particle or skid effects · real team liveries or sponsor colours.
