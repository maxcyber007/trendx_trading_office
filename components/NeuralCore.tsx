import { FAMILIES, MODEL_FAMILIES, MODEL_NAMES, MODEL_OFFSETS, modelCode } from "@/lib/models";

// same design coordinates as the EA dashboard's network background
const W = 1050, H = 980, IN_W = 200, MOD_W = 205, MOD_H = 30, CORE = { x: 800, y: 500, r: 62 };
const inY = (i: number) => 150 + i * 62;
const modX = (k: number) => (k % 2 === 0 ? 255 : 475);
const modY = (k: number) => 60 + Math.floor(k / 2) * 44 + (k % 2) * 22;
const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;
const families = (k: number) => MODEL_FAMILIES.slice(MODEL_OFFSETS[k], MODEL_OFFSETS[k + 1]);

export default function NeuralCore({ states, side }: { states: Map<number, number>; side: number }) {
  const count = FAMILIES.map((_, f) => MODEL_FAMILIES.filter((x) => x === f).length);
  const input = MODEL_NAMES.flatMap((_, k) => families(k).map((f) => curve(IN_W, inY(f) + 16, modX(k), modY(k) + MOD_H / 2)));
  const output = MODEL_NAMES.map((_, k) => curve(modX(k) + MOD_W, modY(k) + MOD_H / 2, CORE.x - CORE.r, CORE.y));
  // moving signals: one per few models, input to model, then model to core
  const flows = MODEL_NAMES.map((_, k) => k).filter((k) => k % 3 === 0);

  return (
    <svg className="net" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="TrendX neural network with 39 models">
      <text className="nh big" x="0" y="22">TRENDX NEURAL CORE</text>
      <text className="nh" x="0" y="120">INPUT LAYER</text>
      <text className="nh" x="255" y="46">MODEL LAYER</text>
      <text className="nh yel" x="490" y="46">x2 = DOUBLE LOT</text>
      <text className="nh redt" x="620" y="46">STOP = PAUSED</text>
      <text className="nh" x="900" y="340">OUTPUT</text>

      <g className="edges">{input.map((d, i) => <path key={i} d={d} />)}{output.map((d, i) => <path key={`o${i}`} d={d} />)}
        <path d={curve(CORE.x + CORE.r, CORE.y, 900, 386)} /><path className="redge" d={curve(CORE.x + CORE.r, CORE.y, 900, 622)} /></g>

      {FAMILIES.map((name, i) => (
        <g key={name} className="inode">
          <rect y={inY(i)} width={IN_W} height="32" rx="16" />
          <circle cx="16" cy={inY(i) + 16} r="4" />
          <text x="30" y={inY(i) + 21}>{name}</text>
          <text className="cnt" x={IN_W - 12} y={inY(i) + 21} textAnchor="end">{count[i]}</text>
        </g>
      ))}

      {MODEL_NAMES.map((name, k) => {
        const st = states.get(k + 1) ?? 0, x = modX(k), y = modY(k);
        return (
          <g key={name} className={`mnode ${st > 0 ? "boost" : st < 0 ? "stop" : ""}`}>
            <rect x={x} y={y} width={MOD_W} height={MOD_H} rx="15" />
            <circle cx={x + 12} cy={y + 15} r="3.5" />
            <text className="code" x={x + 22} y={y + 19}>{modelCode(k + 1)}</text>
            <text x={x + 68} y={y + 19}>{name.length > 18 ? `${name.slice(0, 17)}..` : name}</text>
            {st !== 0 && <g><rect className="tag" x={x + MOD_W - (st > 0 ? 26 : 38)} y={y - 8} width={st > 0 ? 24 : 36} height="15" rx="7" />
              <text className="tagt" x={x + MOD_W - (st > 0 ? 14 : 20)} y={y + 3} textAnchor="middle">{st > 0 ? "x2" : "STOP"}</text></g>}
          </g>
        );
      })}

      <g className="core">
        <circle className="halo" cx={CORE.x} cy={CORE.y} r={CORE.r + 16} />
        <circle className="ring" cx={CORE.x} cy={CORE.y} r={CORE.r} />
        <text x={CORE.x} y={CORE.y - 2} textAnchor="middle">AI CORE</text>
        <text className="sub" x={CORE.x} y={CORE.y + 20} textAnchor="middle">{MODEL_NAMES.length} &gt; 1</text>
      </g>

      <g className={`out long ${side > 0 ? "on" : ""}`}><rect x="900" y="360" width="150" height="52" rx="10" /><text x="975" y="392" textAnchor="middle">LONG</text></g>
      <g className={`out short ${side < 0 ? "on" : ""}`}><rect x="900" y="596" width="150" height="52" rx="10" /><text x="975" y="628" textAnchor="middle">SHORT</text></g>

      <g className="sparks">
        {flows.map((k, i) => (
          <g key={k}>
            <circle r="3"><animateMotion dur={`${2.4 + (i % 4) * 0.5}s`} begin={`${(i * 0.37) % 2}s`} repeatCount="indefinite" path={curve(IN_W, inY(families(k)[0]) + 16, modX(k), modY(k) + MOD_H / 2)} /></circle>
            <circle r="3"><animateMotion dur={`${2 + (i % 3) * 0.6}s`} begin={`${(i * 0.53) % 2}s`} repeatCount="indefinite" path={output[k]} /></circle>
          </g>
        ))}
      </g>
    </svg>
  );
}
