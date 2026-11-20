import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import styles from './style.module.css';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import { totalStat, yearStats, yearSummaryStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { updateSvgSpecialColors } from '@/utils/colorUtils';
import {
  DIST_UNIT,
  ELEV_UNIT,
  formatPace,
  M_TO_DIST,
  M_TO_ELEV,
  type Activity,
} from '@/utils/utils';
import useActivities from '@/hooks/useActivities';
import {
  getActivityCategory,
  getSportMeta,
  isOutdoorSport,
  matchesCategoryFilter,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';
import {
  formatDurationShort,
  getActivityMinutes,
} from '@/utils/workoutAnalytics';

type IntervalType = 'year' | 'month' | 'week' | 'day' | 'life';
type ChartMetric = 'hours' | 'kcal' | 'km';
type PosterKind = 'mol' | 'year_summary' | 'circular' | 'grid' | 'github';

const INTERVAL_TABS: Array<{ key: IntervalType; label: string }> = [
  { key: 'year', label: '按年' },
  { key: 'month', label: '按月' },
  { key: 'week', label: '按周' },
  { key: 'day', label: '按日' },
  { key: 'life', label: '海报' },
];

const POSTER_MODES: Array<{ key: PosterKind; label: string }> = [
  { key: 'mol', label: '人生月历' },
  { key: 'year_summary', label: '年度海报' },
  { key: 'circular', label: '环形年历' },
  { key: 'grid', label: '路线网格' },
  { key: 'github', label: '历年打卡' },
];

const loadRoutePreview = () => import('@/components/RoutePreview');
const RoutePreview = lazy(loadRoutePreview);

const MonthOfLifeSvg = (sportType: string) => {
  const path = sportType === 'all' ? './mol.svg' : `./mol_${sportType}.svg`;
  return lazy(() => loadSvgComponent(totalStat, path));
};

const LIFE_SVG_MAP: Record<
  string,
  React.LazyExoticComponent<React.ComponentType<React.SVGProps<SVGSVGElement>>>
> = {
  all: MonthOfLifeSvg('all'),
  running: MonthOfLifeSvg('running'),
  walking: MonthOfLifeSvg('walking'),
  hiking: MonthOfLifeSvg('hiking'),
  cycling: MonthOfLifeSvg('cycling'),
  swimming: MonthOfLifeSvg('swimming'),
  workout: MonthOfLifeSvg('workout'),
};

const GridSvg = lazy(() => loadSvgComponent(totalStat, './grid.svg'));
const GithubSvg = lazy(() => loadSvgComponent(totalStat, './github.svg'));

const circularYearSvgs = Object.fromEntries(
  Object.keys(yearStats)
    .filter((path) => /^\.\/year_\d{4}\.svg$/.test(path))
    .map((path) => [path, lazy(() => loadSvgComponent(yearStats, path))])
);

const yearSummarySvgs = Object.fromEntries(
  Object.keys(yearSummaryStats).map((path) => [
    path,
    lazy(() => loadSvgComponent(yearSummaryStats, path)),
  ])
);

const SPORT_TO_SVG_TOKEN: Record<string, string> = {
  all: 'all',
  Run: 'running',
  'Trail Run': 'running',
  Walk: 'walking',
  Hike: 'hiking',
  Ride: 'cycling',
  Swim: 'swimming',
  Ski: 'skiing',
  Workout: 'workout',
  CrossFit: 'workout',
  Hyrox: 'workout',
  Badminton: 'workout',
  Strength: 'workout',
  HIIT: 'workout',
  'Other Workout': 'workout',
};

interface PeriodSummary {
  period: string;
  count: number;
  totalMinutes: number;
  totalCalories: number;
  totalDistanceKm: number;
  totalElevationM: number;
  hrSum: number;
  hrCount: number;
  peakHr: number;
  dailyHours: number[];
  dailyCalories: number[];
  dailyKm: number[];
  activities: Activity[];
}

function getBucketCount(interval: IntervalType, period: string): number {
  if (interval === 'year') return 12;
  if (interval === 'week') return 7;
  if (interval === 'month') {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  return 0;
}

function getBucketLabels(interval: IntervalType, count: number): string[] {
  if (interval === 'year') {
    return Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  }
  if (interval === 'week') {
    return ['一', '二', '三', '四', '五', '六', '日'];
  }
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

function buildPeriodSummaries(
  activities: Activity[],
  interval: IntervalType,
  sportFilter: string,
  taxonomyMode: TaxonomyMode
): PeriodSummary[] {
  if (interval === 'life') return [];

  const map = new Map<string, PeriodSummary>();

  activities.forEach((act) => {
    if (
      sportFilter !== 'all' &&
      !matchesCategoryFilter(act, sportFilter, taxonomyMode)
    ) {
      return;
    }

    const dateStr = act.start_date_local.slice(0, 10);
    const [yStr, mStr, dStr] = dateStr.split('-');
    const month = Number(mStr);
    const day = Number(dStr);

    let period: string;
    let bucketIdx = -1;

    if (interval === 'year') {
      period = yStr;
      bucketIdx = month - 1;
    } else if (interval === 'month') {
      period = `${yStr}-${mStr}`;
      bucketIdx = day - 1;
    } else if (interval === 'week') {
      const dt = new Date(`${dateStr}T12:00:00`);
      const dow = (dt.getDay() + 6) % 7;
      const monday = new Date(dt.getTime() - dow * 86400000);
      period = `${monday.toISOString().slice(0, 10)} 周`;
      bucketIdx = dow;
    } else {
      period = dateStr;
    }

    let entry = map.get(period);
    if (!entry) {
      const len = getBucketCount(interval, period);
      entry = {
        period,
        count: 0,
        totalMinutes: 0,
        totalCalories: 0,
        totalDistanceKm: 0,
        totalElevationM: 0,
        hrSum: 0,
        hrCount: 0,
        peakHr: 0,
        dailyHours: Array<number>(len).fill(0),
        dailyCalories: Array<number>(len).fill(0),
        dailyKm: Array<number>(len).fill(0),
        activities: [],
      };
      map.set(period, entry);
    }

    const mins = getActivityMinutes(act);
    const kcal = act.calories || 0;
    const km = (act.distance || 0) / M_TO_DIST;
    const elev = (act.elevation_gain || 0) * M_TO_ELEV;

    entry.count += 1;
    entry.totalMinutes += mins;
    entry.totalCalories += kcal;
    entry.totalDistanceKm += km;
    entry.totalElevationM += elev;
    if (act.average_heartrate && act.average_heartrate > 0) {
      entry.hrSum += act.average_heartrate;
      entry.hrCount += 1;
    }
    if (act.max_heartrate && act.max_heartrate > entry.peakHr) {
      entry.peakHr = Math.round(act.max_heartrate);
    }
    if (bucketIdx >= 0 && bucketIdx < entry.dailyHours.length) {
      entry.dailyHours[bucketIdx] += mins / 60;
      entry.dailyCalories[bucketIdx] += kcal;
      entry.dailyKm[bucketIdx] += km;
    }
    if (interval === 'day') {
      entry.activities.push(act);
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    b.period.localeCompare(a.period)
  );
}

/**
 * Lightweight inline SVG mini bar chart (zero ResizeObserver overhead per card).
 */
const MiniSparkBars = ({
  values,
  labels,
  unit,
  color,
}: {
  values: number[];
  labels: string[];
  unit: string;
  color: string;
}) => {
  const maxVal = Math.max(...values, 0.01);
  const w = 260;
  const h = 58;
  const slot = w / Math.max(1, values.length);
  const barW = Math.max(2.5, Math.min(14, slot * 0.72));

  return (
    <div className={styles.chartStrip}>
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="block"
        role="img"
        aria-label={`分布柱状图 (${unit})`}
      >
        <line
          x1={0}
          y1={h - 14}
          x2={w}
          y2={h - 14}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {values.map((val, i) => {
          const barH = val > 0 ? Math.max(2, (val / maxVal) * (h - 20)) : 0;
          const x = i * slot + (slot - barW) / 2;
          const y = h - 14 - barH;
          const showTick =
            values.length <= 12
              ? true
              : i === 0 ||
                i === Math.floor(values.length / 2) ||
                i === values.length - 1;
          const formatted =
            unit === 'kcal' ? Math.round(val).toLocaleString() : val.toFixed(1);
          return (
            <g key={labels[i] ?? i}>
              {barH > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={1.5}
                  fill={color}
                  fillOpacity={0.88}
                >
                  <title>{`${labels[i] ?? i + 1}: ${formatted} ${unit}`}</title>
                </rect>
              )}
              {showTick && (
                <text
                  x={i * slot + slot / 2}
                  y={h - 2}
                  textAnchor="middle"
                  fill="var(--color-text-muted)"
                  fontSize={9}
                >
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface PeriodCardProps {
  item: PeriodSummary;
  interval: IntervalType;
  metric: ChartMetric;
  accentColor: string;
  deferRender: boolean;
  taxonomyMode: TaxonomyMode;
}

const PeriodCard = React.memo(
  ({
    item,
    interval,
    metric,
    accentColor,
    deferRender,
    taxonomyMode,
  }: PeriodCardProps) => {
    const [showRoute, setShowRoute] = useState(false);
    const hasGps =
      interval === 'day' &&
      item.activities.some((a) => Boolean(a.summary_polyline));
    const avgHr = item.hrCount ? Math.round(item.hrSum / item.hrCount) : 0;
    const totalHours = item.totalMinutes / 60;
    const avgSpeedMps =
      item.totalDistanceKm > 0 && item.totalMinutes > 0
        ? (item.totalDistanceKm * M_TO_DIST) / (item.totalMinutes * 60)
        : 0;

    const chartValues =
      metric === 'hours'
        ? item.dailyHours
        : metric === 'kcal'
          ? item.dailyCalories
          : item.dailyKm;
    const chartUnit =
      metric === 'hours' ? 'h' : metric === 'kcal' ? 'kcal' : DIST_UNIT;
    const chartLabels = getBucketLabels(interval, chartValues.length);

    return (
      <article
        className={`${styles.periodCard} ${deferRender ? 'mwg-deferred-card' : ''}`}
      >
        <header className={styles.cardHeader}>
          <h3 className="font-mono-num text-base font-bold tracking-tight">
            {item.period}
          </h3>
          <span
            className="font-mono-num text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {item.count} 次
          </span>
        </header>

        <dl className={styles.metricGrid}>
          <div>
            <dt
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              时长
            </dt>
            <dd className="font-mono-num mt-0.5 text-sm font-semibold">
              {totalHours >= 10
                ? `${totalHours.toFixed(1)}h`
                : formatDurationShort(item.totalMinutes)}
            </dd>
          </div>

          {item.totalCalories > 0 && (
            <div>
              <dt
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                消耗
              </dt>
              <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                {item.totalCalories >= 10000
                  ? `${(item.totalCalories / 1000).toFixed(1)}k`
                  : Math.round(item.totalCalories).toLocaleString()}{' '}
                <span
                  className="text-[11px] font-normal"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  kcal
                </span>
              </dd>
            </div>
          )}

          {avgHr > 0 && (
            <div>
              <dt
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                均/峰心率
              </dt>
              <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                {avgHr}
                {item.peakHr > 0 && (
                  <span
                    className="text-xs font-normal"
                    style={{
                      color:
                        item.peakHr >= 175
                          ? '#ea580c'
                          : 'var(--color-text-muted)',
                    }}
                  >
                    /{item.peakHr}
                  </span>
                )}
              </dd>
            </div>
          )}

          {item.totalDistanceKm > 0 && (
            <div>
              <dt
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                距离
              </dt>
              <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                {item.totalDistanceKm.toFixed(1)} {DIST_UNIT}
              </dd>
            </div>
          )}

          {SHOW_ELEVATION_GAIN && item.totalElevationM > 0 && (
            <div>
              <dt
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                爬升
              </dt>
              <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                {Math.round(item.totalElevationM)} {ELEV_UNIT}
              </dd>
            </div>
          )}

          {avgSpeedMps > 0 && item.totalDistanceKm > 0 && (
            <div>
              <dt
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                配速
              </dt>
              <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                {formatPace(avgSpeedMps)}
              </dd>
            </div>
          )}
        </dl>

        {interval !== 'day' && chartValues.length > 0 && (
          <MiniSparkBars
            values={chartValues}
            labels={chartLabels}
            unit={chartUnit}
            color={accentColor}
          />
        )}

        {interval === 'day' && item.activities.length > 0 && (
          <ul
            className="space-y-1 border-t pt-2.5 text-xs"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {item.activities.map((a) => {
              const m = getSportMeta(getActivityCategory(a, taxonomyMode));
              return (
                <li
                  key={a.run_id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="truncate">{a.name}</span>
                  </span>
                  <span
                    className="font-mono-num shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {formatDurationShort(getActivityMinutes(a))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {hasGps && (
          <footer className={styles.cardFooter}>
            <button
              type="button"
              onClick={() => setShowRoute((v) => !v)}
              className="text-xs underline underline-offset-4 hover:opacity-80"
              style={{ color: 'var(--color-brand)' }}
            >
              {showRoute ? '收起轨迹预览' : '查看 GPS 轨迹'}
            </button>
          </footer>
        )}

        {showRoute && hasGps && (
          <div className={styles.routePreviewBox}>
            <Suspense
              fallback={
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  加载轨迹…
                </span>
              }
            >
              <RoutePreview activities={item.activities} />
            </Suspense>
          </div>
        )}
      </article>
    );
  }
);

const PosterGallery = ({
  sportType,
  availableYears,
}: {
  sportType: string;
  availableYears: string[];
}) => {
  const [posterKind, setPosterKind] = useState<PosterKind>('mol');
  const [selectedYear, setSelectedYear] = useState<string>(
    () => availableYears[0] ?? '2026'
  );
  const stageRef = useRef<HTMLDivElement | null>(null);

  const activeYear = availableYears.includes(selectedYear)
    ? selectedYear
    : (availableYears[0] ?? '2026');
  const needsYear = posterKind === 'year_summary' || posterKind === 'circular';
  const token = SPORT_TO_SVG_TOKEN[sportType] || 'all';

  // Keyboard arrow navigation across years for year-scoped posters
  useEffect(() => {
    if (!needsYear || availableYears.length === 0) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (
        document.activeElement &&
        document.activeElement.getAttribute('role') === 'tab'
      ) {
        return;
      }
      e.preventDefault();
      const idx = availableYears.indexOf(activeYear);
      if (idx === -1) return;
      if (e.key === 'ArrowLeft' && idx > 0) {
        setSelectedYear(availableYears[idx - 1]);
      } else if (e.key === 'ArrowRight' && idx < availableYears.length - 1) {
        setSelectedYear(availableYears[idx + 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [needsYear, activeYear, availableYears]);

  // Apply theme-aware special color classes to Grid and GitHub SVGs once mounted & on theme change
  useEffect(() => {
    if (posterKind !== 'grid' && posterKind !== 'github') return;

    updateSvgSpecialColors();

    const stageObserver = new MutationObserver(() => {
      updateSvgSpecialColors();
    });
    if (stageRef.current) {
      stageObserver.observe(stageRef.current, {
        childList: true,
        subtree: true,
      });
    }

    const themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          updateSvgSpecialColors();
        }
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      stageObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [posterKind]);

  const handleExportSvg = useCallback(() => {
    const svgEl = stageRef.current?.querySelector('svg');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace(
        '<svg',
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const suffixParts = [posterKind];
    if (
      (posterKind === 'mol' || posterKind === 'year_summary') &&
      token !== 'all'
    ) {
      suffixParts.push(token);
    }
    if (needsYear) {
      suffixParts.push(activeYear);
    }
    link.href = url;
    link.download = `workouts_${suffixParts.join('_')}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [posterKind, token, needsYear, activeYear]);

  const MolSvg = LIFE_SVG_MAP[token] || LIFE_SVG_MAP.all;
  const YearSummarySvg =
    (token !== 'all' &&
      yearSummarySvgs[`./year_summary_${token}_${activeYear}.svg`]) ||
    yearSummarySvgs[`./year_summary_${activeYear}.svg`] ||
    null;
  const CircularSvg = circularYearSvgs[`./year_${activeYear}.svg`] || null;

  const renderPoster = () => {
    if (posterKind === 'mol') {
      return <MolSvg />;
    }
    if (posterKind === 'year_summary') {
      return YearSummarySvg ? (
        <YearSummarySvg />
      ) : (
        <span
          className="py-12 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {activeYear} 年暂无年度海报
        </span>
      );
    }
    if (posterKind === 'circular') {
      return CircularSvg ? (
        <CircularSvg className="year-svg max-h-[68vh] w-auto" />
      ) : (
        <span
          className="py-12 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {activeYear} 年暂无环形年历
        </span>
      );
    }
    if (posterKind === 'grid') {
      return <GridSvg className="grid-svg h-auto w-full" />;
    }
    return <GithubSvg className="github-svg h-auto w-full" />;
  };

  return (
    <div
      role="tabpanel"
      aria-labelledby="summary-tab-life"
      className={styles.lifeSection}
    >
      <div className={styles.posterToolbar}>
        <div
          className="flex flex-wrap items-center gap-4 text-xs"
          role="group"
          aria-label="海报类型"
        >
          {POSTER_MODES.map((m) => {
            const active = posterKind === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={active}
                onClick={() => setPosterKind(m.key)}
                className="pb-1 font-medium"
                style={{
                  color: active
                    ? 'var(--color-text)'
                    : 'var(--color-text-muted)',
                  borderBottom: active
                    ? '2px solid var(--color-brand)'
                    : '2px solid transparent',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleExportSvg}
          className={styles.yearButton}
        >
          导出 SVG
        </button>
      </div>

      {needsYear && (
        <div className={styles.yearSelector} role="group" aria-label="年份选择">
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              aria-pressed={activeYear === yr}
              className={styles.yearButton}
              onClick={() => setSelectedYear(yr)}
            >
              {yr}
            </button>
          ))}
        </div>
      )}

      <div ref={stageRef} className={styles.svgStage}>
        <Suspense
          fallback={
            <span
              className="py-12 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              加载海报…
            </span>
          }
        >
          {renderPoster()}
        </Suspense>
      </div>
    </div>
  );
};

const ActivityList: React.FC = () => {
  const { activities: activityData } = useActivities();
  const [interval, setInterval] = useState<IntervalType>('month');
  const [taxonomyMode, setTaxonomyMode] = useState<TaxonomyMode>('sub');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('hours');
  const tabElementsRef = useRef<Record<IntervalType, HTMLButtonElement | null>>(
    {
      year: null,
      month: null,
      week: null,
      day: null,
      life: null,
    }
  );

  const availableYears = useMemo(
    () =>
      Array.from(
        new Set(activityData.map((a) => a.start_date_local.slice(0, 4)))
      ).sort((a, b) => Number(b) - Number(a)),
    [activityData]
  );

  const sportOptions = useMemo(() => {
    const counts = new Map<string, number>();
    activityData.forEach((a) => {
      const cat = getActivityCategory(a, taxonomyMode);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    const ordered = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, count]) => ({ key: k, count }));
    return [{ key: 'all', count: activityData.length }, ...ordered];
  }, [activityData, taxonomyMode]);

  const summaries = useMemo(
    () =>
      buildPeriodSummaries(activityData, interval, sportFilter, taxonomyMode),
    [activityData, interval, sportFilter, taxonomyMode]
  );

  const activeMetric: ChartMetric =
    sportFilter !== 'all' &&
    isOutdoorSport(sportFilter) &&
    chartMetric === 'hours'
      ? 'hours'
      : chartMetric;

  const accentColor =
    sportFilter === 'all'
      ? 'var(--color-brand)'
      : getSportMeta(sportFilter).color;

  const selectInterval = useCallback(
    (next: IntervalType, shouldFocus = false) => {
      if (next === 'day') {
        void loadRoutePreview();
      }
      setInterval(next);
      const el = tabElementsRef.current[next];
      if (el) {
        if (shouldFocus) el.focus();
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },
    []
  );

  const handleIntervalKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const idx = INTERVAL_TABS.findIndex((t) => t.key === interval);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectInterval(
          INTERVAL_TABS[(idx + 1) % INTERVAL_TABS.length].key,
          true
        );
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectInterval(
          INTERVAL_TABS[(idx - 1 + INTERVAL_TABS.length) % INTERVAL_TABS.length]
            .key,
          true
        );
      } else if (e.key === 'Home') {
        e.preventDefault();
        selectInterval(INTERVAL_TABS[0].key, true);
      } else if (e.key === 'End') {
        e.preventDefault();
        selectInterval(INTERVAL_TABS[INTERVAL_TABS.length - 1].key, true);
      }
    },
    [interval, selectInterval]
  );

  return (
    <div className={styles.summaryPage}>
      {/* Page Title & Controls */}
      <div className={styles.controlBar}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">周期汇总</h1>
          <p
            className="font-mono-num mt-0.5 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {interval === 'life'
              ? '人生月历 · 年度海报 · 环形年历 · 路线网格 · 历年打卡'
              : `${summaries.length} 个周期`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          {/* Taxonomy Toggle */}
          <div className="flex items-center gap-2.5 text-xs">
            {(
              [
                ['sub', '细分项目'],
                ['raw', '原始大类'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setTaxonomyMode(mode);
                  setSportFilter('all');
                }}
                className="pb-0.5"
                style={{
                  color:
                    taxonomyMode === mode
                      ? 'var(--color-text)'
                      : 'var(--color-text-muted)',
                  borderBottom:
                    taxonomyMode === mode
                      ? '1.5px solid var(--color-brand)'
                      : '1.5px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chart Metric Switcher */}
          {interval !== 'life' && interval !== 'day' && (
            <div className="flex items-center gap-2.5 text-xs">
              {(
                [
                  ['hours', '时长'],
                  ['kcal', '消耗'],
                  ['km', '距离'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChartMetric(m)}
                  className="pb-0.5"
                  style={{
                    color:
                      chartMetric === m
                        ? 'var(--color-text)'
                        : 'var(--color-text-muted)',
                    borderBottom:
                      chartMetric === m
                        ? '1.5px solid var(--color-brand)'
                        : '1.5px solid transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accessible Interval Tablist */}
      <div
        role="tablist"
        aria-label="汇总周期"
        className="mwg-tablist"
        onKeyDown={handleIntervalKeyDown}
      >
        {INTERVAL_TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabElementsRef.current[t.key] = el;
            }}
            id={`summary-tab-${t.key}`}
            type="button"
            role="tab"
            tabIndex={interval === t.key ? 0 : -1}
            aria-selected={interval === t.key}
            onClick={() => selectInterval(t.key)}
            className="mwg-tab"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Horizontal Swipeable Sport Filter Strip */}
      <div
        className={styles.sportScroller}
        role="group"
        aria-label="运动项目筛选"
      >
        {sportOptions.map((opt) => {
          const isAll = opt.key === 'all';
          const meta = isAll ? null : getSportMeta(opt.key);
          const pressed = sportFilter === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={pressed}
              className={styles.sportButton}
              onClick={() => setSportFilter(opt.key)}
            >
              {meta && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
              )}
              <span>{isAll ? '全部' : meta?.shortLabel}</span>
              <span className="font-mono-num opacity-65">{opt.count}</span>
            </button>
          );
        })}
      </div>

      {/* Tabpanel Content */}
      {interval === 'life' ? (
        <PosterGallery
          sportType={sportFilter}
          availableYears={availableYears}
        />
      ) : (
        <div
          role="tabpanel"
          aria-labelledby={`summary-tab-${interval}`}
          className={styles.cardGrid}
        >
          {summaries.map((item, idx) => (
            <PeriodCard
              key={item.period}
              item={item}
              interval={interval}
              metric={activeMetric}
              accentColor={accentColor}
              deferRender={idx >= 6}
              taxonomyMode={taxonomyMode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityList;
