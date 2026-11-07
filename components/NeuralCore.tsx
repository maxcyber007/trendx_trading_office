import { useEffect, useRef } from "react";
import { Audiowide } from "next/font/google";
import { FAMILIES, MODEL_FAMILIES, MODEL_NAMES, modelCode } from "@/lib/models";

const space = Audiowide({ subsets: ["latin"], weight: "400", variable: "--font-title" });

const W = 910, H = 860, IN_W = 172, BALL = { x: 468, y: 418, r: 272 }, CORE_R = 56, TILT = .34, SPEED = .22;
// the ball also nods up and down, so all 39 models get their turn at the front centre
const SWAY = 1.45, SWAY_RATE = .27;
// each model is joined to the core by a curved fibre; light waves run along it into the core
// the waves are small comets: a bright head with a tail that thins and fades behind it
// robots take turns lighting their eyes, each at its own moment in the cycle, wherever they are on the ball
const EYE_CYCLE = 7;
const BEND = .26, PACKET_RATE = .5, TRAIL = .2, TAIL = [1, .55, .25];
// a wire brain built in 3D, shaped like a real one (cerebrum, cerebellum, stem), spinning on its upright axis
const BRAIN_SPIN = .8, BRAIN_TILT = .2, BRAIN_Y = BALL.y - 12, BRAIN_K = .85;
const PAD_Y = 772, RISE = [-44, -26, -9, 12, 30, 47], NODE_W = 50, NODE_H = 19, NODE_Y = 3;
// light shooting up from the bottom edge into the projector
const EDGE_Y = H - 5;
// LONG and SHORT sit evenly above and below the middle of the ball
const OUT_X = 777, OUT_W = 128, OUT_H = 42, LONG_Y = BALL.y - 70, SHORT_Y = BALL.y + 70;
// the gap under the title matches the gap under the last input
const IN_H = 26, IN_TOP = 72, IN_LAST = 800.8, inY = (i: number) => IN_TOP + (i * (IN_LAST - IN_TOP)) / (FAMILIES.length - 1);
const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;

type V = [number, number, number];
// the 39 models spread evenly over the ball
const SPOTS: V[] = MODEL_NAMES.map((_, k, all) => {
  const y = 1 - (2 * (k + .5)) / all.length, r = Math.sqrt(1 - y * y), a = k * 2.399963;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});
// turns a point on the ball, then tips the ball toward the viewer
const BRAIN3D: V[][] = (() => {
  const out: V[][] = [], K = BRAIN_K, line = (n: number, f: (u: number) => V) => out.push(Array.from({ length: n + 1 }, (_, i) => f(i / n)));
  // cerebrum: each hemisphere is a stretched dome; z runs front (+) to back (-), the temporal lobe hangs low at the front
  for (const h of [-1, 1]) {
    const at = (th: number, s: number, wob: number): V => {
      const f = Math.pow(Math.sin(s), .5) * (1 + wob), z = 30 * Math.cos(s), c = Math.cos(th) * f;
      const top = 22 - Math.max(0, z) * .16, low = 9 + 9 * Math.exp(-(((z - 7) / 11) ** 2));
      return [h * (1.5 + 13 * Math.sin(th) * f) * K, ((c > 0 ? c * top : c * low) + 3) * K, z * K];
    };
    // winding grooves run front to back, crossing folds run over the top, so the surface looks folded
    for (const t0 of [.18, .55, .92, 1.3, 1.68, 2.06, 2.45])
      line(56, (u) => { const s = .1 + u * (Math.PI - .2); return at(t0 + .13 * Math.sin(s * 10 + t0 * 7 + h) + .06 * Math.sin(s * 23 + t0 * 3), s, .045 * Math.sin(s * 17 + t0 * 5)); });
    for (const s0 of [.42, .8, 1.18, 1.56, 1.94, 2.32, 2.7])
      line(30, (u) => { const th = .05 + u * 2.85; return at(th, s0 + .09 * Math.sin(th * 9 + s0 * 5 + h), .045 * Math.sin(th * 13 + s0 * 3)); });
    // cerebellum tucked under the back, with flat stacked folds
    for (const v of [-.75, -.45, -.15, .15, .45, .75]) {
      const r = Math.sqrt(1 - v * v);
      line(26, (u) => { const t = u * Math.PI * 2, w = 1 + .04 * Math.sin(t * 12); return [(h * 6.5 + 7 * r * Math.cos(t) * w) * K, (-12 + v * 7) * K, (-20 + 10 * r * Math.sin(t) * w) * K]; });
    }
  }
  // brain stem dropping down and a little back
  const stem = (u: number, a: number): V => { const r = 4.6 - u * 1.4; return [r * Math.cos(a) * K, (-6 - u * 26) * K, (-7 - u * 6 + r * Math.sin(a)) * K]; };
  for (const a of [0, 1.57, 3.14, 4.71]) line(10, (u) => stem(u, a));
  for (const u0 of [.2, .55, .9]) line(16, (u) => stem(u0, u * Math.PI * 2));
  return out;
})();
const turn = ([x, y, z]: V, angle: number, tilt: number): V => {
  const c = Math.cos(angle), s = Math.sin(angle), x1 = x * c + z * s, z1 = z * c - x * s;
  return [x1, y * Math.cos(tilt) - z1 * Math.sin(tilt), y * Math.sin(tilt) + z1 * Math.cos(tilt)];
};
const px = (x: number) => (BALL.x + x * BALL.r).toFixed(1), py = (y: number) => (BALL.y - y * BALL.r).toFixed(1);
// where a straight run from the side meets the ball's outline
const rim = (y: number, side: number) => { const dy = Math.max(-.92, Math.min(.92, (y - BALL.y) / BALL.r)); return [BALL.x + side * Math.sqrt(1 - dy * dy) * BALL.r, BALL.y + dy * BALL.r]; };

// the whole picture leans a little toward the pointer
const lean = (e: React.PointerEvent<SVGSVGElement>) => {
  const box = e.currentTarget.getBoundingClientRect(), s = e.currentTarget.style;
  s.setProperty("--ry", `${((e.clientX - box.left) / box.width - .5) * 7}deg`);
  s.setProperty("--rx", `${(.5 - (e.clientY - box.top) / box.height) * 5}deg`);
};
const rest = (e: React.PointerEvent<SVGSVGElement>) => { e.currentTarget.style.removeProperty("--ry"); e.currentTarget.style.removeProperty("--rx"); };

export default function NeuralCore({ states, side }: { states: Map<number, number>; side: number }) {
  const count = FAMILIES.map((_, f) => MODEL_FAMILIES.filter((x) => x === f).length);
  const [lx, ly] = rim(BALL.y - 170, 1), [sx, sy] = rim(BALL.y + 170, 1);
  const toLong = curve(lx, ly, OUT_X, LONG_Y), toShort = curve(sx, sy, OUT_X, SHORT_Y);
  const links = useRef<SVGPathElement>(null), inLinks = useRef<SVGPathElement>(null), comets = useRef<(SVGPathElement | null)[]>([]);
  const brainFront = useRef<SVGPathElement>(null), brainBack = useRef<SVGPathElement>(null);
  const nodes = useRef<(SVGGElement | null)[]>([]), focus = useRef<SVGTextElement>(null), hover = useRef(-1);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0, angle = 0, last = 0, shown = -1;
    const label = (k: number) => {
      if (k === shown || !focus.current) return;
      shown = k;
      focus.current.textContent = `${modelCode(k + 1)}  ${MODEL_NAMES[k]}`;
    };
    const draw = (now: number) => {
      let l = "", n = "", near = 0, nearZ = -2;
      const tails = TAIL.map(() => "");
      let heads = "";
      // a comet along a cubic curve: tail layers get thinner and dimmer the further back they reach
      const wave = (P: number[], t: number) => {
        const at = (u: number) => {
          u = Math.max(0, u);
          const a = 1 - u, p0 = a * a * a, p1 = 3 * a * a * u, p2 = 3 * a * u * u, p3 = u * u * u;
          return `${(p0 * P[0] + p1 * P[2] + p2 * P[4] + p3 * P[6]).toFixed(1)} ${(p0 * P[1] + p1 * P[3] + p2 * P[5] + p3 * P[7]).toFixed(1)}`;
        };
        const run = (from: number) => { let s = `M${at(from)}`; for (let i = 1; i <= 6; i++) s += `L${at(from + ((t - from) * i) / 6)}`; return s; };
        TAIL.forEach((f, i) => { tails[i] += run(t - TRAIL * f); });
        const head = at(t);
        heads += `M${head}L${head}`;
      };
      const path = (P: number[]) => `M${P[0].toFixed(1)} ${P[1].toFixed(1)}C${P.slice(2).map((v) => v.toFixed(1)).join(" ")}`;
      const tilt = TILT + Math.sin(angle * SWAY_RATE) * SWAY;
      SPOTS.forEach((spot, k) => {
        const [x, y, z] = turn(spot, angle, tilt), g = nodes.current[k];
        if (z > nearZ) { nearZ = z; near = k; }
        if (!g) return;
        // nodes on the far side stay hidden; they fade in and out at the edge of the ball
        const seen = Math.max(0, Math.min(1, (z + .02) / .18));
        g.setAttribute("transform", `translate(${px(x)} ${py(y)}) scale(${(.92 + z * .24).toFixed(3)})`);
        g.setAttribute("opacity", (seen * (.75 + z * .25)).toFixed(2));
        g.style.pointerEvents = seen > 0 ? "auto" : "none";
        if (z > .02) {
          // each fibre has its own soft S-bend that drifts slowly, like a strand floating in water
          const X = BALL.x + x * BALL.r, Y = BALL.y - y * BALL.r, dx = BALL.x - X, dy = BALL.y - Y, sec = now / 1000;
          const b1 = BEND * (Math.sin(k * 2.17) + .35 * Math.sin(sec * .6 + k)), b2 = BEND * (.55 * Math.cos(k * 1.31) - .3 * Math.sin(sec * .45 + k * 1.7));
          const toCore = [X, Y, X + dx * .33 - dy * b1, Y + dy * .33 + dx * b1, X + dx * .7 - dy * b2, Y + dy * .7 + dx * b2, BALL.x, BALL.y];
          l += path(toCore);
          wave(toCore, ((now / 1000) * PACKET_RATE + k * .618) % 1);
          // its input family feeds it from the left
          const iy = inY(MODEL_FAMILIES[k]) + 13, mx = (IN_W + X) / 2, fromInput = [IN_W, iy, mx, iy, mx, Y, X, Y];
          n += path(fromInput);
          wave(fromInput, ((now / 1000) * PACKET_RATE * .8 + k * .382) % 1);
        }
      });
      links.current?.setAttribute("d", l);
      inLinks.current?.setAttribute("d", n);
      tails.forEach((t, i) => comets.current[i]?.setAttribute("d", t));
      comets.current[TAIL.length]?.setAttribute("d", heads);
      // the near half of the brain is drawn bright, the far half dim behind it
      const spin = (now / 1000) * BRAIN_SPIN;
      let bf = "", bb = "";
      for (const wire of BRAIN3D) {
        let prev: V | null = null;
        for (const p of wire) {
          const q = turn(p, spin, BRAIN_TILT);
          if (prev) {
            const seg = `M${(BALL.x + prev[0]).toFixed(1)} ${(BRAIN_Y - prev[1]).toFixed(1)}L${(BALL.x + q[0]).toFixed(1)} ${(BRAIN_Y - q[1]).toFixed(1)}`;
            if (q[2] + prev[2] > 0) bf += seg; else bb += seg;
          }
          prev = q;
        }
      }
      brainFront.current?.setAttribute("d", bf);
      brainBack.current?.setAttribute("d", bb);
      label(hover.current >= 0 ? hover.current : near);
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33 || !links.current?.getBoundingClientRect().width) return;   // about 30 frames a second, nothing while hidden
      if (hover.current < 0) angle += ((now - last) / 1000) * SPEED;
      last = now;
      draw(now);
    };
    draw(performance.now());
    if (!still) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // resting on a model stops the ball so it can be read
  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    lean(e);
    const node = (e.target as Element).closest<SVGGElement>(".mnode");
    hover.current = node ? Number(node.dataset.k) : -1;
  };

  return (
    <svg className={`net ${space.variable}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="TrendX neural core: 39 models on a turning ball" onPointerMove={point} onPointerLeave={(e) => { hover.current = -1; rest(e); }}>
      <defs>
        <radialGradient id="brainGlow"><stop offset="0" stopColor="#39ff6a" stopOpacity=".35" /><stop offset=".55" stopColor="#39ff6a" stopOpacity=".1" /><stop offset="1" stopColor="#39ff6a" stopOpacity="0" /></radialGradient>
        <radialGradient id="coreGlow">
          <stop offset="0" stopColor="#39ff6a" stopOpacity=".3" />
          <stop offset=".5" stopColor="#00c853" stopOpacity=".12" />
          <stop offset="1" stopColor="#00c853" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="edgeGlow">
          <stop offset="0" stopColor="#00c853" stopOpacity="0" />
          <stop offset=".3" stopColor="#39ff6a" stopOpacity=".8" />
          <stop offset={BALL.x / W} stopColor="#eafff0" />
          <stop offset=".72" stopColor="#39ff6a" stopOpacity=".8" />
          <stop offset="1" stopColor="#00c853" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="upGlow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#39ff6a" stopOpacity=".38" />
          <stop offset="1" stopColor="#39ff6a" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="titleGlow" gradientUnits="userSpaceOnUse" x1="-260" y1="0" x2="60" y2="0">
          <stop offset="0" stopColor="#39ff6a" stopOpacity=".75" />
          <stop offset=".42" stopColor="#39ff6a" stopOpacity=".75" />
          <stop offset=".5" stopColor="#c9ffdb" stopOpacity=".95" />
          <stop offset=".58" stopColor="#39ff6a" stopOpacity=".75" />
          <stop offset="1" stopColor="#39ff6a" stopOpacity=".75" />
          <animate attributeName="x1" values="-260;760;760" keyTimes="0;.55;1" dur="5s" repeatCount="indefinite" />
          <animate attributeName="x2" values="60;1080;1080" keyTimes="0;.55;1" dur="5s" repeatCount="indefinite" />
        </linearGradient>
        <linearGradient id="titleLine">
          <stop offset="0" stopColor="#39ff6a" stopOpacity="0" />
          <stop offset=".5" stopColor="#eafff0" />
          <stop offset="1" stopColor="#39ff6a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="holoBeam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#39ff6a" stopOpacity=".4" />
          <stop offset=".65" stopColor="#35e0ff" stopOpacity=".09" />
          <stop offset="1" stopColor="#35e0ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle className="coreglow" cx={BALL.x} cy={BALL.y} r={BALL.r + 40} fill="url(#coreGlow)" />
      <g className="uplight">
        <polygon className="fan" fill="url(#upGlow)" points={`${BALL.x - 250},${EDGE_Y} ${BALL.x + 250},${EDGE_Y} ${BALL.x + 84},${PAD_Y} ${BALL.x - 84},${PAD_Y}`} />
        <rect className="edge" y={EDGE_Y} width={W} height="3" fill="url(#edgeGlow)" />
        {[0, 1, 2].map((i) => <ellipse key={i} className={`wave w${i}`} cx={BALL.x} cy={EDGE_Y} rx="62" ry="10" />)}
      </g>
      <g className="projector">
        <polygon fill="url(#holoBeam)" points={`${BALL.x - 30},${PAD_Y} ${BALL.x + 30},${PAD_Y} ${BALL.x + 150},${BALL.y + 200} ${BALL.x - 150},${BALL.y + 200}`} />
        <ellipse className="pad" cx={BALL.x} cy={PAD_Y} rx="84" ry="17" /><ellipse className="pad two" cx={BALL.x} cy={PAD_Y} rx="56" ry="12" /><ellipse className="pad core3" cx={BALL.x} cy={PAD_Y} rx="28" ry="6" /><ellipse className="hit" cx={BALL.x} cy={PAD_Y} rx="84" ry="17" />
        {RISE.map((dx, i) => <circle key={dx} className="rise" r={i % 2 ? 1.6 : 2.2}>
          <animateMotion dur={`${2.6 + (i % 3) * .7}s`} begin={`${i * .45}s`} repeatCount="indefinite" path={`M${BALL.x + dx * .6} ${PAD_Y} L${BALL.x + dx * 2.4} ${BALL.y + 210}`} />
          <animate attributeName="opacity" values="0;1;.8;0" dur={`${2.6 + (i % 3) * .7}s`} begin={`${i * .45}s`} repeatCount="indefinite" /></circle>)}
      </g>
      <text className="title" x={BALL.x} y="40" textAnchor="middle" fill="url(#titleGlow)">TRENDX AI COMMAND CORE</text>
      <rect className="titleline" x={BALL.x - 190} y="49" width="380" height="1.6" fill="url(#titleLine)" />
      <path className="titlegem" d={`M${BALL.x} 45l5 5-5 5-5-5Z`} />
      <text className="nh" x="0" y={inY(0) - 10}>INPUT LAYER</text>
      <text className="nh" x={OUT_X} y={LONG_Y - OUT_H / 2 - 12}>OUTPUT</text>
      <text ref={focus} className="focus" x={BALL.x} y={BALL.y - BALL.r - 34} textAnchor="middle" />

      <path ref={inLinks} className="inlinks" />
      <g className="edges"><path d={toLong} /><path className="redge" d={toShort} /></g>

      {FAMILIES.map((name, i) => (
        <g key={name} className="inode">
          <rect y={inY(i)} width={IN_W} height={IN_H} rx={IN_H / 2} />
          <circle cx="12" cy={inY(i) + 13} r="3.5" />
          <text x="22" y={inY(i) + 17}>{name}</text>
          <text className="cnt" x={IN_W - 10} y={inY(i) + 17} textAnchor="end">{count[i]}</text>
        </g>
      ))}

      <path ref={links} className="links" />
      {[...TAIL, 0].map((_, i) => <path key={i} ref={(el) => { comets.current[i] = el; }} className={i < TAIL.length ? `comet c${i}` : "comet head"} />)}
      <g className="core">
        <circle className="halo" cx={BALL.x} cy={BALL.y} r={CORE_R + 8} />
        <circle className="orbit" cx={BALL.x} cy={BALL.y} r={CORE_R + 13} />
        <circle className="ringc" cx={BALL.x} cy={BALL.y} r={CORE_R} />
        <circle className="brainglow" cx={BALL.x} cy={BRAIN_Y - 4} r="40" fill="url(#brainGlow)" />
        <path ref={brainBack} className="brain3d back" />
        <path ref={brainFront} className="brain3d" />
        <text x={BALL.x} y={BALL.y + 32} textAnchor="middle">AI CORE</text>
      </g>

      {MODEL_NAMES.map((name, k) => {
        const st = states.get(k + 1) ?? 0;
        return (
          <g key={name} ref={(el) => { nodes.current[k] = el; }} data-k={k} className={`mnode ${st > 0 ? "boost" : st < 0 ? "stop" : ""}`} style={{ "--eyeAt": `${(-((k * .618) % 1) * EYE_CYCLE).toFixed(2)}s` } as React.CSSProperties}>
            <title>{`${modelCode(k + 1)} ${name}${st > 0 ? " (x2)" : st < 0 ? " (STOP)" : ""}`}</title>
            <rect x={-NODE_W / 2} y={NODE_Y} width={NODE_W} height={NODE_H} rx={NODE_H / 2} />
            <g className="robot"><path d="M0 -17v3M-9 -9h-2v5h2M9 -9h2v5h-2M-4 -3h8" /><rect x="-9" y="-14" width="18" height="14" rx="4" /><circle className="eyeglow" cx="-4" cy="-8" r="4.5" /><circle className="eyeglow" cx="4" cy="-8" r="4.5" /><circle className="eye" cx="-4" cy="-8" r="1.7" /><circle className="eye" cx="4" cy="-8" r="1.7" /></g>
            <text className="code" y="16.5" textAnchor="middle">{modelCode(k + 1)}</text>
          </g>
        );
      })}

      <g className={`out long ${side > 0 ? "on" : ""}`}><rect x={OUT_X} y={LONG_Y - OUT_H / 2} width={OUT_W} height={OUT_H} rx="9" /><text x={OUT_X + OUT_W / 2} y={LONG_Y + 5} textAnchor="middle">LONG</text></g>
      <g className={`out short ${side < 0 ? "on" : ""}`}><rect x={OUT_X} y={SHORT_Y - OUT_H / 2} width={OUT_W} height={OUT_H} rx="9" /><text x={OUT_X + OUT_W / 2} y={SHORT_Y + 5} textAnchor="middle">SHORT</text></g>

      <g className="sparks">
        <circle r="2.6"><animateMotion dur="2.4s" repeatCount="indefinite" path={toLong} /></circle>
        <circle className="red" r="2.6"><animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path={toShort} /></circle>
      </g>
    </svg>
  );
}
