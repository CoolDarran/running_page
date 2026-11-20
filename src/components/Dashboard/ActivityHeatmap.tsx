import { useMemo, useState } from 'react';
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

interface ActivityHeatmapProps {
  activities: Activity[];
  year: string;
  taxonomyMode: TaxonomyMode;
  selectedDate: string | null;
  onSelectDate: (_date: string | null) => void;
}

interface HoveredDay {
  date: string;
  items: Activity[];
  x: number;
  y: number;
}

const ActivityHeatmap = ({
  activities,
  year,
  taxonomyMode,
  selectedDate,
  onSelectDate,
}: ActivityHeatmapProps) => {
  const [colorMode, setColorMode] = useState<'sport' | 'kcal'>('sport');
  const [hovered, setHovered] = useState<HoveredDay | null>(null);

  const {
    weeks,
    byDate,
    monthLabels,
    activeSports,
    activeDays,
    svgWidth,
    svgHeight,
  } = useMemo(() => {
    const map = new Map<string, Activity[]>();
    let latestDateIso = '';
    activities.forEach((a) => {
      const iso = a.start_date_local.slice(0, 10);
      if (!iso) return;
      if (!latestDateIso || iso > latestDateIso) latestDateIso = iso;
      const list = map.get(iso);
      if (list) list.push(a);
      else map.set(iso, [a]);
    });

    let startDate: Date;
    let endDate: Date;
    if (year === 'Total') {
      const anchor = latestDateIso
        ? new Date(`${latestDateIso}T12:00:00`)
        : new Date();
      endDate = anchor;
      startDate = new Date(anchor.getTime() - 364 * 86400000);
    } else {
      startDate = new Date(`${year}-01-01T12:00:00`);
      endDate = new Date(`${year}-12-31T12:00:00`);
    }

    const startDow = (startDate.getDay() + 6) % 7;
    const gridStart = new Date(startDate.getTime() - startDow * 86400000);

    const wkList: Array<
      Array<{ iso: string; inRange: boolean; month: number }>
    > = [];
    for (
      let cur = new Date(gridStart);
      cur <= endDate;
      cur = new Date(cur.getTime() + 7 * 86400000)
    ) {
      const col: Array<{ iso: string; inRange: boolean; month: number }> = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(cur.getTime() + d * 86400000);
        const iso = dt.toISOString().slice(0, 10);
        col.push({
          iso,
          inRange: dt >= startDate && dt <= endDate,
          month: dt.getMonth() + 1,
        });
      }
      wkList.push(col);
    }

    const labels: Array<{ idx: number; label: string }> = [];
    let lastMo = -1;
    wkList.forEach((wk, idx) => {
      const first = wk.find((c) => c.inRange);
      if (first && first.month !== lastMo) {
        lastMo = first.month;
        labels.push({ idx, label: `${first.month}月` });
      }
    });

    const sports = new Set<string>();
    let days = 0;
    wkList.forEach((wk) => {
      wk.forEach((c) => {
        if (!c.inRange) return;
        const items = map.get(c.iso);
        if (items && items.length) {
          days += 1;
          const dom = items
            .slice()
            .sort((a, b) => getActivityMinutes(b) - getActivityMinutes(a))[0];
          sports.add(getActivityCategory(dom, taxonomyMode));
        }
      });
    });

    const cell = 13;
    const gap = 3;
    const step = cell + gap;
    const leftPad = 24;
    const topPad = 20;

    return {
      weeks: wkList,
      byDate: map,
      monthLabels: labels,
      activeSports: Array.from(sports),
      activeDays: days,
      svgWidth: leftPad + wkList.length * step + 6,
      svgHeight: topPad + 7 * step + 4,
    };
  }, [activities, year, taxonomyMode]);

  const cell = 13;
  const gap = 3;
  const step = cell + gap;
  const leftPad = 24;
  const topPad = 20;
  const dayNames = ['一', '', '三', '', '五', '', '日'];

  return (
    <section
      className="relative border-b pb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {year === 'Total' ? '近 52 周打卡' : `${year} 打卡日历`}
          </h2>
          <span
            className="font-mono-num text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {activeDays} 活跃日
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {(
            [
              ['sport', '按项目'],
              ['kcal', '按消耗'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setColorMode(mode)}
              className="pb-0.5 transition-colors"
              style={{
                color:
                  colorMode === mode
                    ? 'var(--color-text)'
                    : 'var(--color-text-muted)',
                borderBottom:
                  colorMode === mode
                    ? '1.5px solid var(--color-brand)'
                    : '1.5px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto pb-1">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block"
          onMouseLeave={() => setHovered(null)}
        >
          {monthLabels.map((m) => (
            <text
              key={`${m.idx}-${m.label}`}
              x={leftPad + m.idx * step}
              y={12}
              fill="var(--color-text-muted)"
              fontSize={10}
            >
              {m.label}
            </text>
          ))}
          {dayNames.map((lbl, i) =>
            lbl ? (
              <text
                key={lbl}
                x={4}
                y={topPad + i * step + 10}
                fill="var(--color-text-muted)"
                fontSize={10}
              >
                {lbl}
              </text>
            ) : null
          )}
          {weeks.map((wk, wi) =>
            wk.map((c, di) => {
              if (!c.inRange) return null;
              const items = byDate.get(c.iso);
              const x = leftPad + wi * step;
              const y = topPad + di * step;
              const isSelected = selectedDate === c.iso;

              if (!items || !items.length) {
                return (
                  <rect
                    key={c.iso}
                    x={x}
                    y={y}
                    width={cell}
                    height={cell}
                    rx={2}
                    fill="var(--color-border)"
                    fillOpacity={0.55}
                  />
                );
              }

              const dom = items
                .slice()
                .sort(
                  (a, b) => getActivityMinutes(b) - getActivityMinutes(a)
                )[0];
              const sport = getActivityCategory(dom, taxonomyMode);
              const totKcal = items.reduce(
                (s, it) => s + (it.calories || 0),
                0
              );
              const fill =
                colorMode === 'sport'
                  ? getSportMeta(sport).color
                  : 'var(--color-brand)';
              const opacity =
                colorMode === 'sport'
                  ? 0.92
                  : totKcal >= 700
                    ? 1
                    : totKcal >= 500
                      ? 0.78
                      : totKcal >= 300
                        ? 0.52
                        : 0.32;

              return (
                <rect
                  key={c.iso}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={isSelected ? 'var(--color-text)' : 'none'}
                  strokeWidth={isSelected ? 1.8 : 0}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onMouseEnter={(e) =>
                    setHovered({
                      date: c.iso,
                      items,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseMove={(e) =>
                    setHovered((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                    )
                  }
                  onClick={() => onSelectDate(isSelected ? null : c.iso)}
                />
              );
            })
          )}
        </svg>
      </div>

      <div
        className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {colorMode === 'sport' ? (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {activeSports.map((s) => {
              const m = getSportMeta(s);
              return (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-xs"
                    style={{ backgroundColor: m.color }}
                  />
                  {m.shortLabel}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span>低</span>
            {[0.32, 0.52, 0.78, 1].map((op) => (
              <span
                key={op}
                className="h-2.5 w-2.5 rounded-xs"
                style={{ backgroundColor: 'var(--color-brand)', opacity: op }}
              />
            ))}
            <span>≥700 kcal</span>
          </div>
        )}
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(hovered.x + 14, window.innerWidth - 260),
            top: Math.max(12, hovered.y + 14),
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <div className="font-mono-num font-semibold">{hovered.date}</div>
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
                <div>
                  <div className="font-medium">{a.name}</div>
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
      )}
    </section>
  );
};

export default ActivityHeatmap;
