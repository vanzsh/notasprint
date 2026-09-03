// Circuit design archetypes: named design philosophies that describe CHARACTERISTICS, never real-world layouts.
// One structured source consumed by the UI, the WebMCP tools and the move engine, so all three share a vocabulary.
import type { Analysis } from "./circuit";

export const ARCHETYPE_IDS = ["high-speed", "street-technical", "flowing-technical"] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export type ScoreKey = keyof Analysis["scores"];
export type Tendency = "up" | "down" | "neutral";

export type DesignArchetype = {
  id: ArchetypeId;
  name: string;
  /** Three headline traits, one line, for listings and the panel. */
  summary: string;
  /** Design characteristics as short technical phrases. */
  traits: string[];
  /** Reference phrases an agent may hear. Conceptual only: they map to characteristics, never to a layout. */
  aliases: string[];
  /** What applying the archetype does to the live circuit, in design-move vocabulary. */
  interpretation: string;
  /** Direction each design score tends to move when the archetype is applied. */
  tendencies: Record<ScoreKey, Tendency>;
  /** Measurable score bands a circuit should sit in to read as this archetype; the design brief's profile check. */
  scoreTargets: Partial<Record<ScoreKey, { min?: number; max?: number }>>;
  /** Example request to an external agent, shown in the UI. */
  examplePrompt: string;
};

export const ARCHETYPES: readonly DesignArchetype[] = [
  {
    id: "high-speed",
    name: "High-Speed",
    summary: "Long straights · Heavy braking · Low corner density",
    traits: ["Long straights", "Heavy braking zones", "High top-speed potential", "Low corner density", "Few low-speed interruptions", "Strong overtaking opportunities"],
    aliases: ["Monza-style", "power circuit", "speed circuit", "low-downforce circuit", "high-speed profile"],
    interpretation:
      "Opens corner radii as far as the neighbouring geometry allows, removes shallow kinks that interrupt straights (moderate: one, strong: two), and, until the scope has a strong overtaking zone (two at strong), tightens the corner at the end of the longest approach of at least 300 m into a heavy braking zone. Nothing is inserted and no turn is moved; the lap gets faster and simpler with a few big stops.",
    tendencies: { highSpeed: "up", overtaking: "up", flow: "neutral", technicality: "down" },
    scoreTargets: { highSpeed: { min: 80 }, technicality: { max: 55 } },
    examplePrompt: "Make Sector 2 more high-speed.",
  },
  {
    id: "street-technical",
    name: "Street / Technical",
    summary: "Tight radii · Dense sequences · Short straights",
    traits: ["Short straights", "Tight-radius corners", "High corner density", "Low average corner speed", "Linked technical sequences", "Frequent direction changes"],
    aliases: ["Monaco-style", "street circuit", "urban circuit", "stop-go", "tight and twisty"],
    interpretation:
      "Tightens corner radii, then inserts a tight chicane on the longest straight of at least 200 m (two at strong) so no section runs uninterrupted. Corner density rises, straights shorten and average corner speed falls. The start/finish straight is kept.",
    tendencies: { technicality: "up", highSpeed: "down", flow: "down", overtaking: "neutral" },
    scoreTargets: { technicality: { min: 70 }, highSpeed: { max: 50 } },
    examplePrompt: "Add a street-style technical sequence after Turn 6.",
  },
  {
    id: "flowing-technical",
    name: "Flowing / Technical",
    summary: "Linked corners · Esses · Rhythm",
    traits: ["Linked corner sequences", "Esses and direction changes", "Medium/high-speed combinations", "Balanced technicality and speed", "Continuity between corners"],
    aliases: ["Suzuka-style", "flowing circuit", "rhythm circuit", "driver's circuit", "linked esses"],
    interpretation:
      "Pulls corner radii toward the 70–140 m band (slow corners open, very fast sweeps tighten slightly) so consecutive corners share a rhythm, then inserts gentle linked esses on the longest straight of at least 260 m (two at strong). Sectors without such a straight only get the rhythm pass. The start/finish straight is kept.",
    tendencies: { flow: "up", technicality: "up", highSpeed: "down", overtaking: "down" },
    scoreTargets: { flow: { min: 70 } },
    examplePrompt: "Give Sector 3 more flowing technical character.",
  },
];

export const archetypeById = (id: string) => ARCHETYPES.find((a) => a.id === id);

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-(style|inspired|like|profile|character|circuit)$/, "");

/**
 * Resolve an id, name or reference phrase ("Monza-style", "street circuit", "flow") to an archetype.
 * Ambiguous phrases ("technical") resolve to nothing so callers can list the options instead of guessing.
 */
export function resolveArchetype(phrase: string): DesignArchetype | undefined {
  const p = norm(String(phrase ?? ""));
  if (!p) return undefined;
  const keys = (a: DesignArchetype) => [a.id, a.name, ...a.aliases].map(norm);
  const exact = ARCHETYPES.filter((a) => keys(a).includes(p));
  if (exact.length === 1) return exact[0];
  const contains = ARCHETYPES.filter((a) => keys(a).some((k) => p.includes(k)));
  if (contains.length === 1) return contains[0];
  const within = p.length >= 4 ? ARCHETYPES.filter((a) => keys(a).some((k) => k.includes(p))) : [];
  return within.length === 1 ? within[0] : undefined;
}
