import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '@/utils/utils';
import { IS_CHINESE } from '@/utils/const';
import {
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from '@/utils/workoutTaxonomy';
import { getActivityMinutes } from '@/utils/workoutAnalytics';
import { TRAINING_GOALS } from '@/utils/trainingGoals';

type WeeklyMetric = 'hours' | 'kcal' | 'count' | 'km';

interface WeeklyStatProps {
  runs: Activity[];
  taxonomyMode?: TaxonomyMode;
}

const formatRunTime = (minutes: number) => {
  const totalSec = Math.round(minutes * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
};

const mobileQuery = '(max-width: 768px)';
const subscribeToViewport = (onChange: () => void) => {
  const mediaQuery = window.matchMedia(mobileQuery);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
};
const getIsMobile = () => window.matchMedia(mobileQuery).matches;
const getServerIsMobile = () => false;

interface WeekRow {
  timestamp: number;
  xLabel: string;
  totalHours: number;
  totalKcal: number;
  totalCount: number;
  totalKm: number;
  bySport: Record<
    string,
    { hours: number; kcal: number; count: number; km: number }
  >;
  [sportKey: string]: unknown;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: WeekRow }>;
  metric: WeeklyMetric;
}

const WeeklyTooltip = ({ active, payload, metric }: TooltipProps) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const d = new Date(row.timestamp);
  const endD = new Date(row.timestamp + 6 * 86400000);
  const weekStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ~ ${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

  const entries = Object.entries(row.bySport).sort(
    (a, b) => b[1][metric] - a[1][metric]
  );

  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-xs shadow-lg"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      <div className="font-mono-num mb-1 font-semibold">{weekStr}</div>
      <div
        className="font-mono-num mb-2"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {row.totalCount}次 · {row.totalHours.toFixed(1)}h ·{' '}
        {Math.round(row.totalKcal).toLocaleString()} kcal
        {row.totalKm > 0 ? ` · ${row.totalKm.toFixed(1)} km` : ''}
      </div>
      {entries.length > 0 && (
        <div
          className="space-y-1 border-t pt-1.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {entries.map(([sport, stats]) => {
            const meta = getSportMeta(sport);
            const valStr =
              metric === 'hours'
                ? formatRunTime(stats.hours * 60)
                : metric === 'kcal'
                  ? `${Math.round(stats.kcal).toLocaleString()} kcal`
                  : metric === 'count'
                    ? `${stats.count}次`
                    : `${stats.km.toFixed(1)} km`;
            return (
              <div
                key={sport}
                className="flex items-center justify-between gap-4"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span>{meta.shortLabel}</span>
                </span>
                <span className="font-mono-num font-medium">{valStr}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const WeeklyStat = ({ runs, taxonomyMode = 'sub' }: WeeklyStatProps) => {
  const [metric, setMetric] = useState<WeeklyMetric>('hours');
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    getIsMobile,
    getServerIsMobile
  );
  const weekLimit = isMobile ? 26 : 53;

  const { data, sportKeys, avgValue, targetHitCount, goalLine } =
    useMemo(() => {
      if (!runs || runs.length === 0) {
        return {
          data: [] as WeekRow[],
          sportKeys: [] as string[],
          avgValue: 0,
          targetHitCount: 0,
          goalLine: null as { value: number; label: string } | null,
        };
      }

      const sortedRuns = [...runs].sort((a, b) =>
        a.start_date_local.localeCompare(b.start_date_local)
      );

      const getWeekStart = (dateStr: string) => {
        const date = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date.getTime());
        weekStart.setDate(diff);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart.getTime();
      };

      const startWeek = getWeekStart(sortedRuns[0].start_date_local);
      const endWeek = getWeekStart(
        sortedRuns[sortedRuns.length - 1].start_date_local
      );

      const weeksMap = new Map<number, WeekRow>();
      for (
        let cur = new Date(startWeek);
        cur.getTime() <= endWeek;
        cur.setDate(cur.getDate() + 7)
      ) {
        const ts = cur.getTime();
        weeksMap.set(ts, {
          timestamp: ts,
          xLabel: '',
          totalHours: 0,
          totalKcal: 0,
          totalCount: 0,
          totalKm: 0,
          bySport: {},
        });
      }

      const sportTotals = new Map<string, number>();

      sortedRuns.forEach((run) => {
        const w = getWeekStart(run.start_date_local);
        const weekRow = weeksMap.get(w);
        if (!weekRow) return;

        const sport = getActivityCategory(run, taxonomyMode);
        const hours = getActivityMinutes(run) / 60;
        const kcal = run.calories || 0;
        const km = (run.distance || 0) / 1000;

        weekRow.totalHours += hours;
        weekRow.totalKcal += kcal;
        weekRow.totalCount += 1;
        weekRow.totalKm += km;

        if (!weekRow.bySport[sport]) {
          weekRow.bySport[sport] = { hours: 0, kcal: 0, count: 0, km: 0 };
        }
        weekRow.bySport[sport].hours += hours;
        weekRow.bySport[sport].kcal += kcal;
        weekRow.bySport[sport].count += 1;
        weekRow.bySport[sport].km += km;

        const val =
          metric === 'hours'
            ? hours
            : metric === 'kcal'
              ? kcal
              : metric === 'count'
                ? 1
                : km;
        sportTotals.set(sport, (sportTotals.get(sport) || 0) + val);
      });

      const orderedSports = Array.from(sportTotals.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k);

      const allWeeks = Array.from(weeksMap.values());
      const limited =
        allWeeks.length > weekLimit ? allWeeks.slice(-weekLimit) : allWeeks;

      const activeGoal =
        metric === 'kcal'
          ? {
              value: TRAINING_GOALS.weeklyTargetKcal,
              label: `目标 ${TRAINING_GOALS.weeklyTargetKcal.toLocaleString()}`,
            }
          : metric === 'count'
            ? {
                value: TRAINING_GOALS.weeklyFloorDays,
                label: `保底 ${TRAINING_GOALS.weeklyFloorDays}次`,
              }
            : metric === 'hours'
              ? {
                  value: TRAINING_GOALS.weeklyTargetHours,
                  label: `目标 ${TRAINING_GOALS.weeklyTargetHours}h`,
                }
              : null;

      let currentYear = 0;
      let currentMonth = 0;
      let activeCount = 0;
      let metricSum = 0;
      let hitCount = 0;

      const formatted = limited.map((item) => {
        const d = new Date(item.timestamp);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        let xLabel = '';

        if (year !== currentYear) {
          currentYear = year;
          currentMonth = month;
          xLabel = `${year}`;
        } else if (month !== currentMonth) {
          currentMonth = month;
          xLabel = IS_CHINESE
            ? `${month}月`
            : d.toLocaleString('en-US', { month: 'short' });
        }

        if (item.totalCount > 0) {
          activeCount += 1;
        }

        const out: WeekRow = { ...item, xLabel };

        orderedSports.forEach((s) => {
          const v = item.bySport[s]?.[metric] || 0;
          out[`sport_${s}`] =
            metric === 'hours' || metric === 'km'
              ? Number(v.toFixed(2))
              : Math.round(v);
        });

        const rowTotal =
          metric === 'hours'
            ? item.totalHours
            : metric === 'kcal'
              ? item.totalKcal
              : metric === 'count'
                ? item.totalCount
                : item.totalKm;

        metricSum += rowTotal;
        if (activeGoal && rowTotal >= activeGoal.value) {
          hitCount += 1;
        }

        return out;
      });

      return {
        data: formatted,
        sportKeys: orderedSports,
        avgValue: activeCount ? metricSum / activeCount : 0,
        targetHitCount: hitCount,
        goalLine: activeGoal,
      };
    }, [runs, taxonomyMode, metric, weekLimit]);

  if (!data.length) return null;

  const avgFormatted =
    metric === 'hours'
      ? `${avgValue.toFixed(1)} h`
      : metric === 'kcal'
        ? `${Math.round(avgValue).toLocaleString()} kcal`
        : metric === 'count'
          ? `${avgValue.toFixed(1)} 次`
          : `${avgValue.toFixed(1)} km`;

  const hitPct = data.length
    ? Math.round((targetHitCount / data.length) * 100)
    : 0;

  return (
    <section
      className="border-b pb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-sm font-semibold tracking-tight">每周训练量</h2>
          <span
            className="font-mono-num text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            周均 {avgFormatted}
            {goalLine && (
              <>
                {' · '}
                {goalLine.label} 达标 {targetHitCount}/{data.length} 周 (
                {hitPct}%)
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3.5 text-xs">
          {(
            [
              ['hours', '时长'],
              ['kcal', '消耗'],
              ['count', '次数'],
              ['km', '距离'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className="pb-0.5 transition-colors"
              style={{
                color:
                  metric === key
                    ? 'var(--color-text)'
                    : 'var(--color-text-muted)',
                borderBottom:
                  metric === key
                    ? '1.5px solid var(--color-brand)'
                    : '1.5px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 6, right: 6, bottom: 0, left: -14 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="xLabel"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              interval={0}
              minTickGap={18}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                metric === 'kcal' && v >= 1000
                  ? `${(v / 1000).toFixed(1)}k`
                  : String(v)
              }
            />
            <Tooltip
              cursor={{
                fill: 'var(--color-surface-subtle)',
                opacity: 0.7,
              }}
              content={<WeeklyTooltip metric={metric} />}
            />
            {goalLine && (
              <ReferenceLine
                y={goalLine.value}
                stroke="var(--color-brand)"
                strokeDasharray="4 4"
                strokeOpacity={0.75}
              />
            )}
            {metric === 'count' && (
              <ReferenceLine
                y={TRAINING_GOALS.weeklyTargetDays}
                stroke="#d97706"
                strokeDasharray="2 4"
                strokeOpacity={0.65}
              />
            )}
            {sportKeys.map((sport) => (
              <Bar
                key={sport}
                dataKey={`sport_${sport}`}
                stackId="weekly"
                fill={getSportMeta(sport).color}
                radius={[2, 2, 0, 0]}
                maxBarSize={18}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default WeeklyStat;
