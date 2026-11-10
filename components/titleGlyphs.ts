// Hand-drawn lettering for the neural-core title, in the style of a wide techno logo: one even stroke with round ends,
// rounded corners, an A without a crossbar. Each glyph is a centre line on a box CAP units tall (y down), drawn with a
// round-capped stroke, so the letters stay crisp at any size and need no web font.
export const CAP = 14;
const R = 3;   // corner radius
type Glyph = { w: number; d: string };
const G: Record<string, Glyph> = {
  A: { w: 15, d: "M0 14L6.4 1.3Q7.5 -.8 8.6 1.3L15 14" },
  C: { w: 15, d: `M15 0H${R}a${R} ${R} 0 0 0 -${R} ${R}V11a${R} ${R} 0 0 0 ${R} ${R}H15` },
  D: { w: 15, d: `M0 0V14H12a${R} ${R} 0 0 0 ${R} -${R}V${R}a${R} ${R} 0 0 0 -${R} -${R}Z` },
  E: { w: 15, d: `M15 0H${R}a${R} ${R} 0 0 0 -${R} ${R}V11a${R} ${R} 0 0 0 ${R} ${R}H15M0 7H12` },
  I: { w: 0, d: "M0 0V14" },
  L: { w: 13, d: "M0 0V14H13" },
  M: { w: 16, d: "M0 14V0L8 9L16 0V14" },
  N: { w: 15, d: "M0 14V0L15 14V0" },
  O: { w: 15, d: `M${R} 0H12a${R} ${R} 0 0 1 ${R} ${R}V11a${R} ${R} 0 0 1 -${R} ${R}H${R}a${R} ${R} 0 0 1 -${R} -${R}V${R}a${R} ${R} 0 0 1 ${R} -${R}Z` },
  P: { w: 15, d: `M0 14V0H12a${R} ${R} 0 0 1 ${R} ${R}V4a${R} ${R} 0 0 1 -${R} ${R}H0` },
  R: { w: 15, d: `M0 14V0H12a${R} ${R} 0 0 1 ${R} ${R}V4a${R} ${R} 0 0 1 -${R} ${R}H0M12 7a${R} ${R} 0 0 1 ${R} ${R}V14` },
  S: { w: 15, d: `M15 0H${R}a${R} ${R} 0 0 0 -${R} ${R}V4a${R} ${R} 0 0 0 ${R} ${R}H12a${R} ${R} 0 0 1 ${R} ${R}V11a${R} ${R} 0 0 1 -${R} ${R}H0` },
  T: { w: 15, d: "M0 0H15M7.5 0V14" },
  U: { w: 15, d: `M0 0V11a${R} ${R} 0 0 0 ${R} ${R}H12a${R} ${R} 0 0 0 ${R} -${R}V0` },
  V: { w: 15, d: "M0 0L6.4 12.7Q7.5 14.8 8.6 12.7L15 0" },
  X: { w: 15, d: "M0 0L15 14M15 0L0 14" },
};
const GAP = 5.5, SPACE = 9;

// one path for a whole line of capitals, starting at x = 0, plus its width; unknown characters become a space
export function lettering(text: string): { d: string; w: number } {
  let x = 0, d = "";
  for (const ch of text) {
    const g = G[ch];
    if (!g) { x += SPACE; continue; }
    // move each glyph's absolute commands by x (its relative arcs need no change)
    d += g.d.replace(/([MLHVQ])([^MLHVQZaz]*)/g, (_, c: string, args: string) => {
      const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (c === "H") return "H" + (n[0] + x);
      if (c === "V") return "V" + n[0];
      return c + n.map((v, i) => (i % 2 === 0 ? v + x : v)).join(" ");
    });
    x += g.w + GAP;
  }
  return { d, w: Math.max(0, x - GAP) };
}
