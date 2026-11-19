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
      className="relative rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {year === 'Total'
              ? '近 52 周训练打卡热力图'
              : `${year} 年度训练打卡热力图`}
          </h3>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            悬停查看当日明细，点击任意有记录的格子可筛选下方表格
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border p-0.5 text-xs"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setColorMode('sport')}
            className="rounded-md px-2.5 py-1 font-medium transition-colors"
            style={
              colorMode === 'sport'
                ? {
                    backgroundColor: 'var(--color-brand)',
                    color: '#ffffff',
                  }
                : { color: 'var(--color-text-muted)' }
            }
          >
            按项目着色
          </button>
          <button
            type="button"
            onClick={() => setColorMode('kcal')}
            className="rounded-md px-2.5 py-1 font-medium transition-colors"
            style={
              colorMode === 'kcal'
                ? {
                    backgroundColor: 'var(--color-brand)',
                    color: '#ffffff',
                  }
                : { color: 'var(--color-text-muted)' }
            }
          >
            按消耗强度
          </button>
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
                    rx={2.5}
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
                colorMode === 'sport' ? getSportMeta(sport).color : '#10b981';
              const opacity =
                colorMode === 'sport'
                  ? 0.92
                  : totKcal >= 700
                    ? 1
                    : totKcal >= 500
                      ? 0.78
                      : totKcal >= 300
                        ? 0.55
                        : 0.35;

              return (
                <rect
                  key={c.iso}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={2.5}
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
        className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        {colorMode === 'sport' ? (
          <div className="flex flex-wrap items-center gap-3">
            {activeSports.length ? (
              activeSports.map((s) => {
                const m = getSportMeta(s);
                return (
                  <span key={s} className="inline-flex items-center gap-1">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: m.color }}
                    />
                    {m.shortLabel}
                  </span>
                );
              })
            ) : (
              <span>无活跃记录</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span>低</span>
            {[0.35, 0.55, 0.78, 1].map((op) => (
              <span
                key={op}
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: '#10b981', opacity: op }}
              />
            ))}
            <span>高 (≥700 kcal)</span>
          </div>
        )}
        <div className="tabular-nums">
          共{' '}
          <strong style={{ color: 'var(--color-text)' }}>{activeDays}</strong>{' '}
          个活跃训练日
        </div>
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-xl border px-3 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(hovered.x + 14, window.innerWidth - 270),
            top: Math.max(12, hovered.y + 14),
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          <div className="font-semibold tabular-nums">
            {hovered.date}（{hovered.items.length} 次训练）
          </div>
          {hovered.items.map((a) => {
            const m = getSportMeta(getActivityCategory(a, taxonomyMode));
            const km = (a.distance || 0) / 1000;
            return (
              <div key={a.run_id} className="mt-1.5 flex items-start gap-1.5">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div
                    className="tabular-nums"
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
