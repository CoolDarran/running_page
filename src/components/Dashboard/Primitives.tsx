import { useEffect, useRef, useState } from 'react';

/**
 * Bencho-inspired smooth ease-out counter for KPI numbers.
 */
export function RollingNumber({
  value,
  decimals = 0,
  format,
  className = '',
}: {
  value: number;
  decimals?: number;
  format?: (_n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    prevRef.current = value;
    if (start === end) {
      return;
    }

    const duration = 420;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  const text = format
    ? format(display)
    : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return <span className={`tabular-nums ${className}`}>{text}</span>;
}

/**
 * Bencho-inspired compact SVG progress ring for weekly consistency / goal attainment.
 */
export function ArcRing({
  percent,
  size = 64,
  strokeWidth = 6,
  color = 'var(--color-brand)',
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}

/**
 * Detent-inspired clean interactive metric explainer popover.
 */
export function MetricExplainer({
  title,
  items,
}: {
  title: string;
  items: Array<{ term: string; desc: string; color?: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-opacity hover:opacity-100"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
          backgroundColor: 'var(--color-surface-subtle)',
        }}
        aria-expanded={open}
      >
        <span className="font-mono font-bold">?</span>
        <span>指标说明</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-80 rounded-xl border p-3.5 text-xs shadow-xl"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">{title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="opacity-60 hover:opacity-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 leading-relaxed">
            {items.map((item) => (
              <div key={item.term} className="flex items-start gap-2">
                {item.color && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <div>
                  <span className="font-semibold">{item.term}：</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {item.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tremor-inspired multi-segment horizontal CategoryBar (sport mix or HR zones).
 */
export function CategoryBar({
  segments,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  return (
    <div className="space-y-2">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--color-border)' }}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const pct = (s.value / total) * 100;
            return (
              <div
                key={s.key}
                title={`${s.label}: ${pct.toFixed(1)}%`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: s.color,
                  transition: 'width 0.35s ease',
                }}
              />
            );
          })}
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}</span>
                <span className="font-medium tabular-nums">{pct}%</span>
              </span>
            );
          })}
      </div>
    </div>
  );
}
