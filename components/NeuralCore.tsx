import { FAMILIES, MODEL_FAMILIES, MODEL_NAMES, MODEL_OFFSETS, modelCode } from "@/lib/models";

// geometry taken from the EA dashboard's network background
const W = 910, H = 860, IN_W = 172, MOD_W = 172, MOD_H = 26, CORE = { x: 684, y: 466, r: 56 };
const inY = (i: number) => 124 + i * 56.4;
const modX = (k: number) => (k % 2 === 0 ? 225 : 415);
const modY = (k: number) => 48 + Math.floor(k / 2) * 40 + (k % 2) * 20;
const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;
const families = (k: number) => MODEL_FAMILIES.slice(MODEL_OFFSETS[k], MODEL_OFFSETS[k + 1]);
const short = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}..` : s);

export default function NeuralCore({ states, side }: { states: Map<number, number>; side: number }) {
  const count = FAMILIES.map((_, f) => MODEL_FAMILIES.filter((x) => x === f).length);
  const input = MODEL_NAMES.flatMap((_, k) => families(k).map((f) => curve(IN_W, inY(f) + 13, modX(k), modY(k) + MOD_H / 2)));
  const output = MODEL_NAMES.map((_, k) => curve(modX(k) + MOD_W, modY(k) + MOD_H / 2, CORE.x - CORE.r, CORE.y));
  const flows = MODEL_NAMES.map((_, k) => k).filter((k) => k % 3 === 0);   // moving signals on every third model

  return (
    <svg className="net" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="TrendX neural network with 39 models">
      <text className="nh big" x="0" y="14">TRENDX NEURAL CORE</text>
      <text className="nh" x="0" y="114">INPUT LAYER</text>
      <text className="nh" x="225" y="36">MODEL LAYER</text>
      <text className="nh yel" x="415" y="36">x2 = DOUBLE LOT</text>
      <text className="nh redt" x="523" y="36">STOP = PAUSED</text>
      <text className="nh" x="777" y="346">OUTPUT</text>

      <g className="edges">{input.map((d, i) => <path key={i} d={d} />)}{output.map((d, i) => <path key={`o${i}`} d={d} />)}
        <path d={curve(CORE.x + CORE.r, CORE.y, 777, 378)} /><path className="redge" d={curve(CORE.x + CORE.r, CORE.y, 777, 592)} /></g>

      {FAMILIES.map((name, i) => (
        <g key={name} className="inode">
          <rect y={inY(i)} width={IN_W} height="26" rx="13" />
          <circle cx="12" cy={inY(i) + 13} r="3.5" />
          <text x="22" y={inY(i) + 17}>{name}</text>
          <text className="cnt" x={IN_W - 10} y={inY(i) + 17} textAnchor="end">{count[i]}</text>
        </g>
      ))}

      {MODEL_NAMES.map((name, k) => {
        const st = states.get(k + 1) ?? 0, x = modX(k), y = modY(k);
        return (
          <g key={name} className={`mnode ${st > 0 ? "boost" : st < 0 ? "stop" : ""}`}>
            <rect x={x} y={y} width={MOD_W} height={MOD_H} rx="13" />
            <circle cx={x + 11} cy={y + 13} r="3.2" />
            <text className="code" x={x + 19} y={y + 17}>{modelCode(k + 1)}</text>
            <text x={x + 58} y={y + 17}>{short(name)}</text>
            {st !== 0 && <g><rect className="tag" x={x + MOD_W - (st > 0 ? 24 : 36)} y={y - 7} width={st > 0 ? 20 : 34} height="13" rx="6.5" />
              <text className="tagt" x={x + MOD_W - (st > 0 ? 14 : 19)} y={y + 3} textAnchor="middle">{st > 0 ? "x2" : "STOP"}</text></g>}
          </g>
        );
      })}

      <g className="core">
        <circle className="halo" cx={CORE.x} cy={CORE.y} r={CORE.r + 8} />
        <circle className="orbit" cx={CORE.x} cy={CORE.y} r={CORE.r + 13} />
        <circle className="orbit two" cx={CORE.x} cy={CORE.y} r={CORE.r + 7} />
        <circle className="ringc" cx={CORE.x} cy={CORE.y} r={CORE.r} />
        <text x={CORE.x} y={CORE.y - 3} textAnchor="middle">AI CORE</text>
        <text className="sub" x={CORE.x} y={CORE.y + 18} textAnchor="middle">{MODEL_NAMES.length} &gt; 1</text>
      </g>

      <g className={`out long ${side > 0 ? "on" : ""}`}><rect x="777" y="358" width="128" height="42" rx="9" /><text x="841" y="384" textAnchor="middle">LONG</text></g>
      <g className={`out short ${side < 0 ? "on" : ""}`}><rect x="777" y="572" width="128" height="42" rx="9" /><text x="841" y="598" textAnchor="middle">SHORT</text></g>

      <g className="sparks">
        {flows.map((k, i) => (
          <g key={k}>
            <circle r="2.6"><animateMotion dur={`${2.4 + (i % 4) * 0.5}s`} begin={`${(i * 0.37) % 2}s`} repeatCount="indefinite" path={curve(IN_W, inY(families(k)[0]) + 13, modX(k), modY(k) + MOD_H / 2)} /></circle>
            <circle r="2.6"><animateMotion dur={`${2 + (i % 3) * 0.6}s`} begin={`${(i * 0.53) % 2}s`} repeatCount="indefinite" path={output[k]} /></circle>
          </g>
        ))}
      </g>
    </svg>
  );
}
