import { useId, useMemo, useState } from 'react';
import type { Activity } from '@/utils/utils';
import { getSportMeta, type TaxonomyMode } from '@/utils/workoutTaxonomy';
import {
  DayActivityTooltip,
  getDaySportCategories,
  getSplitCellCssBackground,
  SplitGradientDefs,
  type HoveredDayState,
  type SplitGradientSpec,
} from './HeatmapShared';

interface ActivityHeatmapProps {
  activities: Activity[];
  year: string;
  taxonomyMode: TaxonomyMode;
  selectedDate: string | null;
  onSelectDate: (_date: string | null) => void;
}

const ActivityHeatmap = ({
  activities,
  year,
  taxonomyMode,
  selectedDate,
  onSelectDate,
}: ActivityHeatmapProps) => {
  const rawId = useId();
  const gradientPrefix = `hm-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [colorMode, setColorMode] = useState<'sport' | 'kcal'>('sport');
  const [hovered, setHovered] = useState<HoveredDayState | null>(null);

  const {
    weeks,
    byDate,
    dayColorsByIso,
    splitGradients,
    gradientIdByKey,
    monthLabels,
    activeSports,
    activeDays,
    multiSportDays,
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

    const parseIsoUtc = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    };

    let startDate: Date;
    let endDate: Date;
    if (year === 'Total') {
      const anchor = latestDateIso
        ? parseIsoUtc(latestDateIso)
        : new Date(
            Date.UTC(
              new Date().getFullYear(),
              new Date().getMonth(),
              new Date().getDate()
            )
          );
      endDate = anchor;
      startDate = new Date(anchor.getTime() - 364 * 86400000);
    } else {
      const yearNum = Number(year);
      startDate = new Date(Date.UTC(yearNum, 0, 1));
      endDate = new Date(Date.UTC(yearNum, 11, 31));
    }

    const startDow = (startDate.getUTCDay() + 6) % 7;
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
          month: dt.getUTCMonth() + 1,
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

    const sportCounts = new Map<string, number>();
    const colorsByIso = new Map<string, string[]>();
    const gradSpecs: SplitGradientSpec[] = [];
    const gradIdMap = new Map<string, string>();
    let days = 0;
    let multiDays = 0;

    wkList.forEach((wk) => {
      wk.forEach((c) => {
        if (!c.inRange) return;
        const items = map.get(c.iso);
        if (items && items.length) {
          days += 1;
          const categories = getDaySportCategories(items, taxonomyMode);
          categories.forEach((cat) => {
            sportCounts.set(cat, (sportCounts.get(cat) || 0) + 1);
          });
          const colors = categories.map((cat) => getSportMeta(cat).color);
          colorsByIso.set(c.iso, colors);

          if (colors.length > 1) {
            multiDays += 1;
            const key = colors.join('|');
            if (!gradIdMap.has(key)) {
              const id = `${gradientPrefix}-split-${gradSpecs.length}`;
              gradIdMap.set(key, id);
              gradSpecs.push({ key, id, colors });
            }
          }
        }
      });
    });

    const orderedSports = Array.from(sportCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    const cell = 13;
    const gap = 3;
    const step = cell + gap;
    const leftPad = 24;
    const topPad = 20;

    return {
      weeks: wkList,
      byDate: map,
      dayColorsByIso: colorsByIso,
      splitGradients: gradSpecs,
      gradientIdByKey: gradIdMap,
      monthLabels: labels,
      activeSports: orderedSports,
      activeDays: days,
      multiSportDays: multiDays,
      svgWidth: leftPad + wkList.length * step + 6,
      svgHeight: topPad + 7 * step + 4,
    };
  }, [activities, year, taxonomyMode, gradientPrefix]);

  const cell = 13;
  const gap = 3;
  const step = cell + gap;
  const leftPad = 24;
  const topPad = 20;
  const dayNames = ['一', '', '三', '', '五', '', '日'];

  const sampleSplitBg = useMemo(() => {
    const firstPair = splitGradients[0]?.colors.slice(0, 2);
    if (firstPair && firstPair.length === 2) {
      return getSplitCellCssBackground(firstPair);
    }
    return getSplitCellCssBackground(['#10b981', '#38bdf8']);
  }, [splitGradients]);

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
          {colorMode === 'sport' && (
            <SplitGradientDefs gradients={splitGradients} />
          )}

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

              const colors = dayColorsByIso.get(c.iso) || ['#94a3b8'];
              const totKcal = items.reduce(
                (s, it) => s + (it.calories || 0),
                0
              );

              let fill: string;
              if (colorMode === 'sport') {
                if (colors.length > 1) {
                  const gradId = gradientIdByKey.get(colors.join('|'));
                  fill = gradId ? `url(#${gradId})` : colors[0];
                } else {
                  fill = colors[0];
                }
              } else {
                fill = 'var(--color-brand)';
              }

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
          <>
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
            {multiSportDays > 0 && (
              <span className="font-mono-num inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-xs"
                  style={{ background: sampleSplitBg }}
                />
                双练多色 · {multiSportDays} 天
              </span>
            )}
          </>
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

      <DayActivityTooltip hovered={hovered} taxonomyMode={taxonomyMode} />
    </section>
  );
};

export default ActivityHeatmap;
