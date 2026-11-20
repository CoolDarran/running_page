import { lazy, Suspense, useMemo } from 'react';
import useActivities from '@/hooks/useActivities';
import { formatPace, M_TO_DIST, M_TO_ELEV, ELEV_UNIT } from '@/utils/utils';
import useHover from '@/hooks/useHover';
import { yearStats, githubYearStats } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { SHOW_ELEVATION_GAIN } from '@/utils/const';
import {
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';
import { computeDayStreak, getActivityMinutes } from '@/utils/workoutAnalytics';
import { RollingNumber } from '@/components/Dashboard/Primitives';

const yearSvgs = Object.fromEntries(
  Object.keys(yearStats).map((path) => [
    path,
    lazy(() => loadSvgComponent(yearStats, path)),
  ])
);

const githubYearSvgs = Object.fromEntries(
  Object.keys(githubYearStats).map((path) => [
    path,
    lazy(() => loadSvgComponent(githubYearStats, path)),
  ])
);

interface YearStatProps {
  year: string;
  isActiveYear?: boolean;
  selectedSport?: string | null;
  taxonomyMode?: TaxonomyMode;
  onTaxonomyChange?: (_mode: TaxonomyMode) => void;
  onClick: (_year: string) => void;
  onClickTypeInYear: (_year: string, _type: string) => void;
}

const YearStat = ({
  year,
  isActiveYear = false,
  selectedSport = null,
  taxonomyMode = 'sub',
  onTaxonomyChange,
  onClick,
  onClickTypeInYear,
}: YearStatProps) => {
  const { activities: allActivities, years } = useActivities();
  const [hovered, eventHandlers] = useHover();
  const YearSVG = yearSvgs[`./year_${year}.svg`];
  const GithubYearSVG = githubYearSvgs[`./github_${year}.svg`];

  const stats = useMemo(() => {
    const runs = years.includes(year)
      ? allActivities.filter((run) => run.start_date_local.slice(0, 4) === year)
      : allActivities;

    let sumDistance = 0;
    let sumElevationGain = 0;
    let sumMinutes = 0;
    let sumCalories = 0;
    let heartRateSum = 0;
    let heartRateCount = 0;
    let peakHeartRate = 0;
    let totalMetersForPace = 0;
    let totalSecondsForPace = 0;

    const buckets = new Map<
      string,
      { count: number; minutes: number; meters: number; calories: number }
    >();

    runs.forEach((run) => {
      const dist = run.distance || 0;
      const mins = getActivityMinutes(run);
      const cals = run.calories || 0;
      sumDistance += dist;
      sumElevationGain += run.elevation_gain || 0;
      sumMinutes += mins;
      sumCalories += cals;

      if (run.average_speed && dist > 0 && run.average_speed > 0) {
        totalMetersForPace += dist;
        totalSecondsForPace += dist / run.average_speed;
      }

      if (run.average_heartrate && run.average_heartrate > 0) {
        heartRateSum += run.average_heartrate;
        heartRateCount += 1;
      }
      if (run.max_heartrate && run.max_heartrate > peakHeartRate) {
        peakHeartRate = Math.round(run.max_heartrate);
      }

      const category = getActivityCategory(run, taxonomyMode);
      const existing = buckets.get(category);
      if (existing) {
        existing.count += 1;
        existing.minutes += mins;
        existing.meters += dist;
        existing.calories += cals;
      } else {
        buckets.set(category, {
          count: 1,
          minutes: mins,
          meters: dist,
          calories: cals,
        });
      }
    });

    const workoutsArr = Array.from(buckets.entries()).sort(
      (a, b) => b[1].count - a[1].count
    );
    const maxSportCount = workoutsArr.length ? workoutsArr[0][1].count : 1;

    let yoyHoursPct: number | null = null;
    if (years.includes(year)) {
      const prevYear = String(Number(year) - 1);
      if (years.includes(prevYear)) {
        const prevMins = allActivities
          .filter((r) => r.start_date_local.slice(0, 4) === prevYear)
          .reduce((s, r) => s + getActivityMinutes(r), 0);
        if (prevMins > 60) {
          yoyHoursPct = ((sumMinutes - prevMins) / prevMins) * 100;
        }
      }
    }

    return {
      count: runs.length,
      totalHours: sumMinutes / 60,
      totalCalories: Math.round(sumCalories),
      totalDistance: parseFloat((sumDistance / M_TO_DIST).toFixed(0)),
      totalElevationGain: (sumElevationGain * M_TO_ELEV).toFixed(0),
      hasElevation: sumElevationGain > 0,
      streak: computeDayStreak(runs),
      hasPace: totalSecondsForPace > 0,
      avgPace: formatPace(totalMetersForPace / totalSecondsForPace),
      avgHeartRate: heartRateCount
        ? Math.round(heartRateSum / heartRateCount)
        : 0,
      peakHeartRate,
      workoutsArr,
      maxSportCount,
      yoyHoursPct,
    };
  }, [allActivities, years, year, taxonomyMode]);

  // Flat hairline row for inactive years
  if (!isActiveYear) {
    return (
      <div
        className="border-b py-2.5"
        style={{ borderColor: 'var(--color-border)' }}
        {...eventHandlers}
      >
        <button
          type="button"
          onClick={() => onClick(year)}
          className="flex w-full items-baseline justify-between gap-2 text-left transition-opacity hover:opacity-75"
        >
          <span className="flex items-baseline gap-2">
            <span className="font-mono-num text-sm font-semibold">
              {year === 'Total' ? '全部年份' : year}
            </span>
            <span
              className="font-mono-num text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {stats.count}次
            </span>
          </span>
          <span
            className="font-mono-num text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <strong style={{ color: 'var(--color-text)' }}>
              {stats.totalHours.toFixed(1)}h
            </strong>
            {stats.totalCalories > 0 && (
              <span className="ml-2">
                {stats.totalCalories >= 10000
                  ? `${(stats.totalCalories / 1000).toFixed(1)}k`
                  : stats.totalCalories.toLocaleString()}{' '}
                kcal
              </span>
            )}
          </span>
        </button>
        {year !== 'Total' && hovered && YearSVG && GithubYearSVG && (
          <Suspense fallback={null}>
            <YearSVG className="year-svg my-3 h-4/6 w-4/6 border-0 p-0" />
            <GithubYearSVG className="github-year-svg my-3 h-auto w-full border-0 p-0" />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <section
      className="border-b pb-6"
      style={{ borderColor: 'var(--color-border)' }}
      {...eventHandlers}
    >
      {/* Year Header */}
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={() => onClick(year)}
          className="text-left"
        >
          <h2 className="font-mono-num text-2xl font-bold tracking-tight">
            {year === 'Total' ? '全部年份' : year}
          </h2>
        </button>
        {stats.yoyHoursPct !== null && (
          <span
            className="font-mono-num text-xs font-medium"
            style={{
              color:
                stats.yoyHoursPct >= 0
                  ? 'var(--color-brand)'
                  : 'var(--color-text-muted)',
            }}
          >
            {stats.yoyHoursPct >= 0 ? '+' : ''}
            {stats.yoyHoursPct.toFixed(1)}% vs {Number(year) - 1}
          </span>
        )}
      </div>

      {/* Flat 2x2 Typographic KPI Grid (zero nested boxes) */}
      <dl
        className="grid grid-cols-2 gap-x-4 gap-y-4 border-b pb-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            总时长
          </dt>
          <dd
            className="mt-0.5 text-2xl font-bold tracking-tight"
            style={{ color: 'var(--color-brand)' }}
          >
            <RollingNumber value={stats.totalHours} decimals={1} />
            <span className="ml-0.5 text-xs font-medium">h</span>
          </dd>
        </div>

        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            总消耗
          </dt>
          <dd className="mt-0.5 text-2xl font-bold tracking-tight">
            <RollingNumber
              value={stats.totalCalories}
              format={(n) =>
                n >= 10000
                  ? `${(n / 1000).toFixed(1)}k`
                  : Math.round(n).toLocaleString()
              }
            />
            <span
              className="ml-1 text-xs font-normal"
              style={{ color: 'var(--color-text-muted)' }}
            >
              kcal
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            训练次数
          </dt>
          <dd className="mt-0.5 text-xl font-semibold tracking-tight">
            <RollingNumber value={stats.count} />
            <span
              className="ml-1 text-xs font-normal"
              style={{ color: 'var(--color-text-muted)' }}
            >
              均{' '}
              {stats.count
                ? Math.round((stats.totalHours * 60) / stats.count)
                : 0}
              m
            </span>
          </dd>
        </div>

        <div>
          <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            最长连续
          </dt>
          <dd className="mt-0.5 text-xl font-semibold tracking-tight">
            <RollingNumber value={stats.streak} />
            <span
              className="ml-0.5 text-xs font-normal"
              style={{ color: 'var(--color-text-muted)' }}
            >
              天
            </span>
          </dd>
        </div>
      </dl>

      {/* Secondary Inline Stats */}
      <dl
        className="font-mono-num flex items-center justify-between gap-2 border-b py-3 text-xs"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <dt className="inline" style={{ color: 'var(--color-text-muted)' }}>
            均心率{' '}
          </dt>
          <dd className="inline font-semibold">
            {stats.avgHeartRate ? `${stats.avgHeartRate}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="inline" style={{ color: 'var(--color-text-muted)' }}>
            峰值{' '}
          </dt>
          <dd
            className="inline font-semibold"
            style={{
              color:
                stats.peakHeartRate >= 175 ? '#ea580c' : 'var(--color-text)',
            }}
          >
            {stats.peakHeartRate ? `${stats.peakHeartRate}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="inline" style={{ color: 'var(--color-text-muted)' }}>
            户外{' '}
          </dt>
          <dd className="inline font-semibold">
            {stats.totalDistance > 0 ? `${stats.totalDistance}km` : '—'}
          </dd>
        </div>
      </dl>

      {SHOW_ELEVATION_GAIN && stats.hasElevation && stats.hasPace && (
        <div
          className="font-mono-num flex items-center justify-between pt-2.5 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span>
            爬升 {stats.totalElevationGain}
            {ELEV_UNIT}
          </span>
          <span>户外配速 {stats.avgPace}</span>
        </div>
      )}

      {/* Sport Breakdown List */}
      <div className="mt-4 space-y-2.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span
            className="font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            项目分布
          </span>
          {onTaxonomyChange && (
            <div className="flex items-center gap-2.5">
              {(
                [
                  ['sub', '细分'],
                  ['raw', '原始'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTaxonomyChange(mode);
                  }}
                  className="pb-0.5 transition-colors"
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
          )}
        </div>

        <ul className="space-y-1">
          {stats.workoutsArr.map(([sport, item]) => {
            const meta = getSportMeta(sport);
            const isSelected = selectedSport === sport;
            const barPct = Math.max(
              4,
              Math.round((item.count / stats.maxSportCount) * 100)
            );
            const subMetric = meta.indoor
              ? `${(item.minutes / 60).toFixed(1)}h · ${
                  item.calories >= 1000
                    ? `${(item.calories / 1000).toFixed(1)}k`
                    : Math.round(item.calories)
                } kcal`
              : `${(item.meters / M_TO_DIST).toFixed(1)} km · ${(item.minutes / 60).toFixed(1)}h`;

            return (
              <li key={sport}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickTypeInYear(year, sport);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--color-surface-subtle)'
                      : 'transparent',
                    boxShadow: isSelected
                      ? `inset 2px 0 0 ${meta.color}`
                      : 'inset 2px 0 0 transparent',
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="truncate font-medium">{meta.label}</span>
                    </span>
                    <span className="font-mono-num shrink-0 font-semibold">
                      {isSelected ? '✓ ' : ''}
                      {item.count}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-4">
                    <div
                      className="h-1 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--color-border)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: meta.color,
                        }}
                      />
                    </div>
                    <span
                      className="font-mono-num shrink-0 text-[11px]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {subMetric}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default YearStat;
