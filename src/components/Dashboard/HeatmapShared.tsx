import type { Activity } from '@/utils/utils';
import {
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';
import {
  formatDurationShort,
  getActivityMinutes,
} from '@/utils/workoutAnalytics';

export interface HoveredDayState {
  date: string;
  items: Activity[];
  x: number;
  y: number;
}

export interface SplitGradientSpec {
  key: string;
  id: string;
  colors: string[];
}

/**
 * Returns unique sport categories for a day, ordered by total duration descending.
 */
export function getDaySportCategories(
  items: Activity[],
  taxonomyMode: TaxonomyMode
): string[] {
  if (!items.length) return [];

  const durationByCategory = new Map<string, number>();
  items.forEach((item) => {
    const category = getActivityCategory(item, taxonomyMode);
    durationByCategory.set(
      category,
      (durationByCategory.get(category) || 0) + getActivityMinutes(item)
    );
  });

  return Array.from(durationByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
}

/**
 * Returns one swatch color per unique sport category active on a day.
 */
export function getDaySportColors(
  items: Activity[],
  taxonomyMode: TaxonomyMode
): string[] {
  return getDaySportCategories(items, taxonomyMode).map(
    (category) => getSportMeta(category).color
  );
}

/**
 * Builds a crisp hard-stop CSS linear-gradient splitting a cell into equal vertical segments.
 */
export function getSplitCellCssBackground(colors: string[]): string {
  if (!colors.length) return 'transparent';
  if (colors.length === 1) return colors[0];

  const stops = colors.flatMap((color, idx) => {
    const start = ((idx / colors.length) * 100).toFixed(2);
    const end = (((idx + 1) / colors.length) * 100).toFixed(2);
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/**
 * Renders deduplicated SVG <linearGradient> definitions for equal multi-color split cells.
 */
export const SplitGradientDefs = ({
  gradients,
}: {
  gradients: SplitGradientSpec[];
}) => {
  if (!gradients.length) return null;

  return (
    <defs>
      {gradients.map(({ id, colors }) => (
        <linearGradient key={id} id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          {colors.flatMap((color, idx) => {
            const start = `${((idx / colors.length) * 100).toFixed(2)}%`;
            const end = `${(((idx + 1) / colors.length) * 100).toFixed(2)}%`;
            return [
              <stop
                key={`${color}-${start}-start`}
                offset={start}
                stopColor={color}
                stopOpacity={1}
              />,
              <stop
                key={`${color}-${end}-end`}
                offset={end}
                stopColor={color}
                stopOpacity={1}
              />,
            ];
          })}
        </linearGradient>
      ))}
    </defs>
  );
};

/**
 * Shared floating editorial tooltip listing all workouts on a hovered day.
 */
export const DayActivityTooltip = ({
  hovered,
  taxonomyMode,
}: {
  hovered: HoveredDayState | null;
  taxonomyMode: TaxonomyMode;
}) => {
  if (!hovered || !hovered.items.length) return null;

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const estHeight = Math.min(320, 44 + hovered.items.length * 42);
  const left = Math.max(12, Math.min(hovered.x + 14, viewportW - 276));
  const top =
    hovered.y + 14 + estHeight > viewportH - 12
      ? Math.max(12, hovered.y - estHeight - 10)
      : Math.max(12, hovered.y + 14);

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        left,
        top,
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      <div className="font-mono-num flex items-baseline justify-between gap-3 font-semibold">
        <span>{hovered.date}</span>
        {hovered.items.length > 1 && (
          <span
            className="text-[11px] font-normal"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {hovered.items.length} 项活动
          </span>
        )}
      </div>
      {hovered.items.map((a) => {
        const m = getSportMeta(getActivityCategory(a, taxonomyMode));
        const km = (a.distance || 0) / 1000;
        return (
          <div key={a.run_id} className="mt-1 flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            <div className="min-w-0">
              <div className="truncate font-medium">{a.name}</div>
              <div
                className="font-mono-num"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {formatDurationShort(getActivityMinutes(a))}
                {a.calories ? ` · ${Math.round(a.calories)} kcal` : ''}
                {a.average_heartrate
                  ? ` · ${Math.round(a.average_heartrate)}/${a.max_heartrate ? Math.round(a.max_heartrate) : '?'} bpm`
                  : ''}
                {km > 0 ? ` · ${km.toFixed(1)} km` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
