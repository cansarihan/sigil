/**
 * The seal ring: one arc per signer, filled as approvals arrive.
 *
 * A bar would show progress; a ring shows the group. At a glance you read how
 * many people are on this decision and how many are still missing, which is
 * the only question a signer opens the page to answer.
 */
export type SealTone = "collecting" | "quorum" | "settled" | "void";

const TONE_STROKE: Record<SealTone, string> = {
  collecting: "var(--brass)",
  quorum: "var(--wax)",
  settled: "var(--verdigris)",
  void: "var(--parchment-faint)",
};

interface SealProps {
  readonly total: number;
  readonly filled: number;
  readonly tone: SealTone;
  readonly size?: number;
}

export function Seal({ total, filled, tone, size = 46 }: SealProps) {
  const radius = size / 2 - 4;
  const centre = size / 2;
  // A wider gap on small rings keeps the segments legible; on large signer
  // sets the gap has to shrink or the arcs vanish entirely.
  const gap = total > 8 ? 3 : 8;
  const step = 360 / Math.max(total, 1);

  return (
    <svg
      className="seal"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${filled} of ${total} signers have approved`}
    >
      {Array.from({ length: Math.max(total, 1) }, (_, index) => {
        const approved = index < filled;
        return (
          <path
            key={index}
            className="seal-arc"
            d={arc(centre, centre, radius, index * step + gap / 2, (index + 1) * step - gap / 2)}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            stroke={approved ? TONE_STROKE[tone] : "var(--line-strong)"}
            opacity={approved ? 1 : 0.9}
          />
        );
      })}
      <text
        className="seal-count"
        x={centre}
        y={centre}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {filled}
      </text>
    </svg>
  );
}

/** SVG arc between two angles, measured clockwise from twelve o'clock. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = polar(cx, cy, r, to);
  const end = polar(cx, cy, r, from);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, r: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}
