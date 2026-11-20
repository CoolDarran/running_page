import { useEffect, useId, useRef, useState } from 'react';

/**
 * Smooth ease-out counter for KPI numbers. Respects prefers-reduced-motion.
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
    if (start === end) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      const id = requestAnimationFrame(() => setDisplay(end));
      return () => cancelAnimationFrame(id);
    }

    const duration = 360;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
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

  return <span className={`font-mono-num ${className}`}>{text}</span>;
}

/**
 * Compact SVG progress ring for weekly consistency target.
 */
export function ArcRing({
  percent,
  size = 56,
  strokeWidth = 5,
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
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
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
          style={{ transition: 'stroke-dashoffset 0.45s ease' }}
        />
      </svg>
      <span className="font-mono-num absolute text-xs font-semibold">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}

/**
 * On-demand metric disclosure backed by native HTML Popover API (top-layer,
 * light-dismiss on Esc/outside click) with JS coordinate fallback when CSS
 * anchor positioning (`position-area`) is unavailable.
 */
export function MetricExplainer({
  title,
  items,
}: {
  title: string;
  items: Array<{ term: string; desc: string; color?: string }>;
}) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const pop = popoverRef.current;
    const trigger = triggerRef.current;
    if (!pop || !trigger) return;

    const supportsAnchor =
      typeof CSS !== 'undefined' && CSS.supports('position-area: bottom');
    if (supportsAnchor) return;

    const onBeforeToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      if (toggleEvent.newState !== 'open') return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 32);
      const left = Math.max(
        16,
        Math.min(rect.right - width, window.innerWidth - width - 16)
      );
      pop.style.position = 'fixed';
      pop.style.top = `${rect.bottom + 6}px`;
      pop.style.left = `${left}px`;
      pop.style.right = 'auto';
    };

    pop.addEventListener('beforetoggle', onBeforeToggle);
    return () => pop.removeEventListener('beforetoggle', onBeforeToggle);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        {...({ popovertarget: popoverId } as Record<string, string>)}
        className="inline-flex items-center gap-1 text-xs underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span>指标说明</span>
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        {...({ popover: 'auto' } as Record<string, string>)}
        className="mwg-popover text-xs"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <button
            type="button"
            {...({
              popovertarget: popoverId,
              popovertargetaction: 'hide',
            } as Record<string, string>)}
            className="opacity-60 hover:opacity-100"
            aria-label="关闭说明"
          >
            ✕
          </button>
        </div>
        <dl className="space-y-2 leading-relaxed">
          {items.map((item) => (
            <div key={item.term} className="flex items-start gap-2">
              {item.color && (
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <div>
                <dt className="inline font-semibold">{item.term}：</dt>
                <dd
                  className="inline"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {item.desc}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

/**
 * Multi-segment horizontal proportion bar (HR zones or sport mix).
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
        className="flex h-2 w-full overflow-hidden rounded-full"
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
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}</span>
                <span className="font-mono-num font-medium">{pct}%</span>
              </span>
            );
          })}
      </div>
    </div>
  );
}
