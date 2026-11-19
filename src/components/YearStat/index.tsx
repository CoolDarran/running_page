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

    // Optional YoY duration delta vs previous calendar year
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

  // Compact row for inactive years to keep the sidebar clean and scannable
  if (!isActiveYear) {
    return (
      <div
        className="cursor-pointer rounded-xl border px-3.5 py-2.5 transition-colors"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        onClick={() => onClick(year)}
        {...eventHandlers}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tabular-nums">
              {year === 'Total' ? 'All Time' : year}
            </span>
            <span
              className="text-xs tabular-nums"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {stats.count} 次
            </span>
          </div>
          <div
            className="flex items-center gap-2.5 text-xs tabular-nums"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span
              className="font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {stats.totalHours.toFixed(1)}h
            </span>
            {stats.totalCalories > 0 && (
              <span>
                {stats.totalCalories >= 10000
                  ? `${(stats.totalCalories / 1000).toFixed(1)}k`
                  : stats.totalCalories.toLocaleString()}{' '}
                kcal
              </span>
            )}
          </div>
        </div>
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
    <div
      className="space-y-4 rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      {...eventHandlers}
    >
      {/* Header + YoY badge */}
      <div
        className="flex cursor-pointer items-baseline justify-between gap-2"
        onClick={() => onClick(year)}
      >
        <div>
          <div
            className="text-xs tracking-wider uppercase"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Selected Period
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight tabular-nums">
            {year === 'Total' ? 'All Time' : `${year} Journey`}
          </h2>
        </div>
        {stats.yoyHoursPct !== null && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
            style={{
              backgroundColor:
                stats.yoyHoursPct >= 0
                  ? 'rgba(16,185,129,0.14)'
                  : 'rgba(148,163,184,0.16)',
              color:
                stats.yoyHoursPct >= 0 ? '#10b981' : 'var(--color-text-muted)',
            }}
          >
            {stats.yoyHoursPct >= 0 ? '+' : ''}
            {stats.yoyHoursPct.toFixed(1)}% vs {Number(year) - 1}
          </span>
        )}
      </div>

      {/* 2x2 Duration & Calorie First Hero Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="rounded-lg border p-3"
          style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            总次数
          </div>
          <div className="mt-0.5 text-2xl font-extrabold">
            <RollingNumber value={stats.count} />
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Sessions
          </div>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            总时长
          </div>
          <div
            className="mt-0.5 text-2xl font-extrabold"
            style={{ color: 'var(--color-brand)' }}
          >
            <RollingNumber value={stats.totalHours} decimals={1} />
            <span className="ml-0.5 text-sm font-semibold">h</span>
          </div>
          <div
            className="text-xs tabular-nums"
            style={{ color: 'var(--color-text-muted)' }}
          >
            均{' '}
            {stats.count
              ? Math.round((stats.totalHours * 60) / stats.count)
              : 0}
            m / 次
          </div>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            总消耗
          </div>
          <div className="mt-0.5 text-2xl font-extrabold">
            <RollingNumber
              value={stats.totalCalories}
              format={(n) =>
                n >= 10000
                  ? `${(n / 1000).toFixed(1)}k`
                  : Math.round(n).toLocaleString()
              }
            />
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            KCAL
          </div>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            最长连续
          </div>
          <div className="mt-0.5 text-2xl font-extrabold">
            <RollingNumber value={stats.streak} />
            <span className="ml-0.5 text-sm font-semibold">天</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Day Streak
          </div>
        </div>
      </div>

      {/* Secondary Metrics Strip */}
      <div
        className="grid grid-cols-3 gap-2 border-t pt-3 text-center"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            均心率
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">
            {stats.avgHeartRate ? `${stats.avgHeartRate} bpm` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            峰值心率
          </div>
          <div
            className="mt-0.5 text-sm font-bold tabular-nums"
            style={{
              color:
                stats.peakHeartRate >= 175 ? '#f97316' : 'var(--color-text)',
            }}
          >
            {stats.peakHeartRate ? `${stats.peakHeartRate} bpm` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            户外距离
          </div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">
            {stats.totalDistance > 0 ? `${stats.totalDistance} km` : '—'}
          </div>
        </div>
      </div>

      {SHOW_ELEVATION_GAIN && stats.hasElevation && stats.hasPace && (
        <div
          className="flex items-center justify-between text-xs tabular-nums"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span>
            累计爬升 {stats.totalElevationGain} {ELEV_UNIT}
          </span>
          <span>户外均配速 {stats.avgPace}</span>
        </div>
      )}

      {/* Sport Breakdown with Sub-type / Raw Toggle */}
      <div
        className="space-y-2.5 border-t pt-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-semibold tracking-wider uppercase"
            style={{ color: 'var(--color-text-muted)' }}
          >
            运动项目分布
          </span>
          {onTaxonomyChange && (
            <div
              className="inline-flex rounded-lg border p-0.5 text-xs"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface-subtle)',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTaxonomyChange('sub');
                }}
                className="rounded-md px-2 py-0.5 font-medium transition-colors"
                style={
                  taxonomyMode === 'sub'
                    ? {
                        backgroundColor: 'var(--color-brand)',
                        color: '#ffffff',
                      }
                    : { color: 'var(--color-text-muted)' }
                }
              >
                细分
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTaxonomyChange('raw');
                }}
                className="rounded-md px-2 py-0.5 font-medium transition-colors"
                style={
                  taxonomyMode === 'raw'
                    ? {
                        backgroundColor: 'var(--color-brand)',
                        color: '#ffffff',
                      }
                    : { color: 'var(--color-text-muted)' }
                }
              >
                原始
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {stats.workoutsArr.map(([sport, item]) => {
            const meta = getSportMeta(sport);
            const isSelected = selectedSport === sport;
            const barPct = Math.max(
              6,
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
              <button
                key={sport}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickTypeInYear(year, sport);
                }}
                className="w-full rounded-lg border px-3 py-2 text-left transition-all"
                style={{
                  backgroundColor: 'var(--color-surface-subtle)',
                  borderColor: isSelected
                    ? 'var(--color-brand)'
                    : 'var(--color-border)',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--color-brand)'
                    : 'none',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="truncate text-xs font-medium">
                      {meta.label}
                    </span>
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {item.count}
                  </span>
                </div>
                <div
                  className="mt-1 text-xs tabular-nums"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {subMetric}
                </div>
                <div
                  className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--color-border)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${barPct}%`, backgroundColor: meta.color }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default YearStat;
