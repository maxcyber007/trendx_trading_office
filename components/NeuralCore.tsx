import { useEffect, useRef } from "react";
import { Audiowide } from "next/font/google";
import { FAMILIES, MODEL_FAMILIES, MODEL_NAMES, modelCode } from "@/lib/models";

const space = Audiowide({ subsets: ["latin"], weight: "400", variable: "--font-title" });

const W = 910, H = 860, IN_W = 172, BALL = { x: 468, y: 418, r: 272 }, CORE_R = 56, TILT = .34, SPEED = .22;
const PAD_Y = 772, RISE = [-44, -26, -9, 12, 30, 47], NODE_W = 44, NODE_H = 44;
// light shooting up from the bottom edge into the projector
const EDGE_Y = H - 5;
const BRAIN = "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18ZM12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18ZM15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4M17.599 6.5a3 3 0 0 0 .399-1.375M6.003 5.125A3 3 0 0 0 6.401 6.5M3.477 10.896a4 4 0 0 1 .585-.396M19.938 10.5a4 4 0 0 1 .585.396M6 18a4 4 0 0 1-1.967-.516M19.967 17.484A4 4 0 0 1 18 18";
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
const circle = (at: (t: number) => V) => Array.from({ length: 33 }, (_, i) => at((i / 32) * Math.PI * 2));
const WIRES: V[][] = [
  ...[0, 1, 2, 3, 4, 5].map((m) => { const a = (m / 6) * Math.PI; return circle((t) => [Math.cos(t) * Math.cos(a), Math.sin(t), Math.cos(t) * Math.sin(a)]); }),
  ...[-.72, -.4, 0, .4, .72].map((y) => { const r = Math.sqrt(1 - y * y); return circle((t) => [Math.cos(t) * r, y, Math.sin(t) * r]); }),
];
// turns a point on the ball, then tips the ball toward the viewer
const turn = ([x, y, z]: V, angle: number): V => {
  const c = Math.cos(angle), s = Math.sin(angle), x1 = x * c + z * s, z1 = z * c - x * s;
  return [x1, y * Math.cos(TILT) - z1 * Math.sin(TILT), y * Math.sin(TILT) + z1 * Math.cos(TILT)];
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
  const input = FAMILIES.map((_, i) => { const [x, y] = rim(inY(i) + 13, -1); return curve(IN_W, inY(i) + 13, x, y); });
  const [lx, ly] = rim(BALL.y - 170, 1), [sx, sy] = rim(BALL.y + 170, 1);
  const toLong = curve(lx, ly, OUT_X, LONG_Y), toShort = curve(sx, sy, OUT_X, SHORT_Y);
  const front = useRef<SVGPathElement>(null), back = useRef<SVGPathElement>(null), links = useRef<SVGPathElement>(null);
  const nodes = useRef<(SVGGElement | null)[]>([]), focus = useRef<SVGTextElement>(null), hover = useRef(-1);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0, angle = 0, last = 0, shown = -1;
    const label = (k: number) => {
      if (k === shown || !focus.current) return;
      shown = k;
      focus.current.textContent = `${modelCode(k + 1)}  ${MODEL_NAMES[k]}`;
    };
    const draw = () => {
      let f = "", b = "", l = "", near = 0, nearZ = -2;
      for (const wire of WIRES) {
        let prev: V | null = null;
        for (const p of wire) {
          const q = turn(p, angle);
          if (prev) {
            const seg = `M${px(prev[0])} ${py(prev[1])}L${px(q[0])} ${py(q[1])}`;
            if (q[2] + prev[2] > 0) f += seg; else b += seg;
          }
          prev = q;
        }
      }
      SPOTS.forEach((spot, k) => {
        const [x, y, z] = turn(spot, angle), g = nodes.current[k];
        if (z > nearZ) { nearZ = z; near = k; }
        if (!g) return;
        // a node passing behind the core disappears behind it
        const hidden = z < 0 && Math.hypot(x, y) * BALL.r < CORE_R + 16;
        g.setAttribute("transform", `translate(${px(x)} ${py(y)}) scale(${(.92 + z * .24).toFixed(3)})`);
        g.setAttribute("opacity", hidden ? "0" : (.5 + (z + 1) * .25).toFixed(2));
        // the glow rises and falls with the turn, so a node fades in at the front and out toward the back
        g.style.setProperty("--glow", Math.max(0, Math.min(1, (z - .02) / .3)).toFixed(2));
        if (z > -.15) l += `M${px(x)} ${py(y)}L${BALL.x} ${BALL.y}`;
      });
      front.current?.setAttribute("d", f);
      back.current?.setAttribute("d", b);
      links.current?.setAttribute("d", l);
      label(hover.current >= 0 ? hover.current : near);
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33 || !front.current?.getBoundingClientRect().width) return;   // about 30 frames a second, nothing while hidden
      if (hover.current < 0) angle += ((now - last) / 1000) * SPEED;
      last = now;
      draw();
    };
    draw();
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

      <g className="edges">{input.map((d, i) => <path key={i} d={d} />)}
        <path d={toLong} /><path className="redge" d={toShort} /></g>

      {FAMILIES.map((name, i) => (
        <g key={name} className="inode">
          <rect y={inY(i)} width={IN_W} height={IN_H} rx={IN_H / 2} />
          <circle cx="12" cy={inY(i) + 13} r="3.5" />
          <text x="22" y={inY(i) + 17}>{name}</text>
          <text className="cnt" x={IN_W - 10} y={inY(i) + 17} textAnchor="end">{count[i]}</text>
        </g>
      ))}

      <path ref={back} className="wire back" />
      <circle className="rimline" cx={BALL.x} cy={BALL.y} r={BALL.r} />
      <path ref={links} className="links" />
      <g className="core">
        <circle className="halo" cx={BALL.x} cy={BALL.y} r={CORE_R + 8} />
        <circle className="orbit" cx={BALL.x} cy={BALL.y} r={CORE_R + 13} />
        <circle className="ringc" cx={BALL.x} cy={BALL.y} r={CORE_R} />
        <path className="brain" d={BRAIN} transform={`translate(${BALL.x - 26} ${BALL.y - 44}) scale(2.17)`} />
        <text x={BALL.x} y={BALL.y + 32} textAnchor="middle">AI CORE</text>
      </g>
      <path ref={front} className="wire" />

      {MODEL_NAMES.map((name, k) => {
        const st = states.get(k + 1) ?? 0;
        return (
          <g key={name} ref={(el) => { nodes.current[k] = el; }} data-k={k} className={`mnode ${st > 0 ? "boost" : st < 0 ? "stop" : ""}`}>
            <title>{`${modelCode(k + 1)} ${name}${st > 0 ? " (x2)" : st < 0 ? " (STOP)" : ""}`}</title>
            <rect className="glow" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={NODE_H / 2} />
            <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={NODE_H / 2} />
            <rect className="tube" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={NODE_H / 2} />
            <text className="code" y="4" textAnchor="middle">{modelCode(k + 1)}</text>
          </g>
        );
      })}

      <g className={`out long ${side > 0 ? "on" : ""}`}><rect x={OUT_X} y={LONG_Y - OUT_H / 2} width={OUT_W} height={OUT_H} rx="9" /><text x={OUT_X + OUT_W / 2} y={LONG_Y + 5} textAnchor="middle">LONG</text></g>
      <g className={`out short ${side < 0 ? "on" : ""}`}><rect x={OUT_X} y={SHORT_Y - OUT_H / 2} width={OUT_W} height={OUT_H} rx="9" /><text x={OUT_X + OUT_W / 2} y={SHORT_Y + 5} textAnchor="middle">SHORT</text></g>

      <g className="sparks">
        {input.map((d, i) => <circle key={i} r="2.6"><animateMotion dur={`${2.4 + (i % 4) * 0.5}s`} begin={`${(i * 0.37) % 2}s`} repeatCount="indefinite" path={d} /></circle>)}
        <circle r="2.6"><animateMotion dur="2.4s" repeatCount="indefinite" path={toLong} /></circle>
        <circle className="red" r="2.6"><animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path={toShort} /></circle>
      </g>
    </svg>
  );
}
