import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '@/utils/utils';
import type { TaxonomyMode } from '@/utils/workoutTaxonomy';
import {
  computeFitnessSeries,
  computeHrLoadBySport,
  computePersonalRecords,
  computeRhythmMatrix,
  computeWeeklyConsistency,
  computeYtdComparison,
  parseHrZones,
  type YtdMetric,
} from '@/utils/workoutAnalytics';
import { ArcRing, CategoryBar, MetricExplainer } from './Primitives';

interface TrainingInsightsProps {
  allActivities: Activity[];
  filteredActivities: Activity[];
  taxonomyMode: TaxonomyMode;
  year: string;
}

const YEAR_LINE_COLORS = ['#15803d', '#0284c7', '#9333ea', '#71717a'];
const HR_ZONE_COLORS = ['#94a3b8', '#38bdf8', '#10b981', '#f59e0b', '#ef4444'];
const HR_ZONE_LABELS = ['Z1 恢复', 'Z2 有氧', 'Z3 节奏', 'Z4 阈值', 'Z5 极限'];

const TrainingInsights = ({
  allActivities,
  filteredActivities,
  taxonomyMode,
  year,
}: TrainingInsightsProps) => {
  const [ytdMetric, setYtdMetric] = useState<YtdMetric>('hours');
  const [weeklyTarget, setWeeklyTarget] = useState<number>(3);

  const fitness = useMemo(
    () => computeFitnessSeries(allActivities, 180),
    [allActivities]
  );

  const ytd = useMemo(
    () => computeYtdComparison(allActivities, ytdMetric, 4),
    [allActivities, ytdMetric]
  );

  const consistency = useMemo(
    () => computeWeeklyConsistency(filteredActivities, weeklyTarget, 52),
    [filteredActivities, weeklyTarget]
  );

  const hrBySport = useMemo(
    () => computeHrLoadBySport(filteredActivities, taxonomyMode),
    [filteredActivities, taxonomyMode]
  );

  const rhythm = useMemo(
    () => computeRhythmMatrix(filteredActivities),
    [filteredActivities]
  );

  const records = useMemo(
    () => computePersonalRecords(filteredActivities, taxonomyMode),
    [filteredActivities, taxonomyMode]
  );

  const hrZoneTotals = useMemo(() => {
    const totals = [0, 0, 0, 0, 0];
    let syncedCount = 0;
    filteredActivities.forEach((a) => {
      const z = parseHrZones(a);
      if (z) {
        syncedCount += 1;
        for (let i = 0; i < 5; i++) totals[i] += z[i];
      }
    });
    return { totals, syncedCount };
  }, [filteredActivities]);

  const acwrNote = useMemo(() => {
    if (!fitness.latest) return null;
    const { acwr } = fitness.latest;
    if (acwr > 1.35) return { text: '负荷偏高', color: '#ea580c' };
    if (acwr >= 0.8) return { text: '进阶区', color: 'var(--color-brand)' };
    return { text: '恢复期', color: 'var(--color-text-muted)' };
  }, [fitness.latest]);

  const consistencyPct = consistency.totalWeeks
    ? (consistency.hitWeeks / consistency.totalWeeks) * 100
    : 0;

  return (
    <div className="space-y-8">
      {/* 1. Fitness & Fatigue (TRIMP -> CTL / ATL / TSB) */}
      <section
        className="border-b pb-7"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-sm font-semibold tracking-tight">
              体能与疲劳（近 180 天）
            </h2>
            {fitness.latest && (
              <div className="font-mono-num flex flex-wrap items-baseline gap-4 text-xs">
                <span>
                  <span style={{ color: 'var(--color-text-muted)' }}>CTL </span>
                  <strong style={{ color: 'var(--color-brand)' }}>
                    {fitness.latest.ctl}
                  </strong>
                </span>
                <span>
                  <span style={{ color: 'var(--color-text-muted)' }}>ATL </span>
                  <strong style={{ color: '#ea580c' }}>
                    {fitness.latest.atl}
                  </strong>
                </span>
                <span>
                  <span style={{ color: 'var(--color-text-muted)' }}>TSB </span>
                  <strong>
                    {fitness.latest.tsb > 0
                      ? `+${fitness.latest.tsb}`
                      : fitness.latest.tsb}
                  </strong>
                </span>
                {acwrNote && (
                  <span style={{ color: acwrNote.color }}>
                    ACWR {fitness.latest.acwr} · {acwrNote.text}
                  </span>
                )}
              </div>
            )}
          </div>
          <MetricExplainer
            title="TRIMP 负荷模型"
            items={[
              {
                term: 'CTL 体能',
                desc: '42 天指数平均负荷，衡量长期有氧与体能底子。',
                color: '#10b981',
              },
              {
                term: 'ATL 疲劳',
                desc: '7 天指数平均负荷，反映近期急性训练压力。',
                color: '#ea580c',
              },
              {
                term: 'TSB 状态',
                desc: 'CTL − ATL。正值为恢复良好，持续低于 −20 需注意休整。',
                color: '#0284c7',
              },
              {
                term: 'ACWR 负荷比',
                desc: 'ATL / CTL，0.8–1.3 为理想进阶区间。',
              },
            ]}
          />
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={fitness.series}
              margin={{ top: 6, right: 8, bottom: 0, left: -14 }}
            >
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                minTickGap={28}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine
                y={0}
                stroke="var(--color-border)"
                strokeDasharray="2 2"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  borderRadius: '0.5rem',
                  fontSize: '12px',
                  color: 'var(--color-text)',
                }}
              />
              <Area
                type="monotone"
                dataKey="tsb"
                name="TSB 状态"
                stroke="#0284c7"
                fill="#0284c7"
                fillOpacity={0.1}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="ctl"
                name="CTL 体能"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="atl"
                name="ATL 疲劳"
                stroke="#ea580c"
                strokeWidth={1.6}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2. YTD Cumulative Comparison + Weekly Consistency */}
      <div
        className="grid grid-cols-1 gap-8 border-b pb-7 xl:grid-cols-12"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <section className="xl:col-span-7">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              跨年累计对比（YTD）
            </h2>
            <div className="flex items-center gap-3 text-xs">
              {(
                [
                  ['hours', '时长'],
                  ['kcal', '消耗'],
                  ['count', '次数'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setYtdMetric(key)}
                  className="pb-0.5 transition-colors"
                  style={{
                    color:
                      ytdMetric === key
                        ? 'var(--color-text)'
                        : 'var(--color-text-muted)',
                    borderBottom:
                      ytdMetric === key
                        ? '1.5px solid var(--color-brand)'
                        : '1.5px solid transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={ytd.points}
                margin={{ top: 6, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  minTickGap={26}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    ytdMetric === 'kcal' && v >= 1000
                      ? `${Math.round(v / 1000)}k`
                      : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    color: 'var(--color-text)',
                  }}
                />
                {ytd.years.map((yr, idx) => (
                  <Line
                    key={yr}
                    type="monotone"
                    dataKey={yr}
                    name={yr}
                    stroke={YEAR_LINE_COLORS[idx % YEAR_LINE_COLORS.length]}
                    strokeWidth={idx === 0 ? 2.4 : 1.5}
                    strokeDasharray={idx >= 2 ? '4 3' : undefined}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div
            className="font-mono-num mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {ytd.years.map((yr, idx) => (
              <span key={yr} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      YEAR_LINE_COLORS[idx % YEAR_LINE_COLORS.length],
                  }}
                />
                <strong style={{ color: 'var(--color-text)' }}>{yr}</strong>
                <span>
                  {ytdMetric === 'hours'
                    ? `${ytd.yearTotals[yr]}h`
                    : ytdMetric === 'kcal'
                      ? `${ytd.yearTotals[yr].toLocaleString()} kcal`
                      : `${ytd.yearTotals[yr]}次`}
                </span>
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col justify-between xl:col-span-5">
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                周达标追踪 · {year === 'Total' ? '近52周' : year}
              </h2>
              <div className="flex items-center gap-2.5 text-xs">
                {[2, 3, 4].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setWeeklyTarget(t)}
                    className="font-mono-num pb-0.5"
                    style={{
                      color:
                        weeklyTarget === t
                          ? 'var(--color-text)'
                          : 'var(--color-text-muted)',
                      borderBottom:
                        weeklyTarget === t
                          ? '1.5px solid var(--color-brand)'
                          : '1.5px solid transparent',
                    }}
                  >
                    ≥{t}练
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-5 py-2">
              <ArcRing percent={consistencyPct} size={62} strokeWidth={5} />
              <dl className="grid flex-1 grid-cols-3 gap-2 text-xs">
                <div>
                  <dt style={{ color: 'var(--color-text-muted)' }}>达标</dt>
                  <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                    {consistency.hitWeeks}/{consistency.totalWeeks}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--color-text-muted)' }}>当前连达</dt>
                  <dd
                    className="font-mono-num mt-0.5 text-sm font-semibold"
                    style={{ color: 'var(--color-brand)' }}
                  >
                    {consistency.currentStreak}周
                  </dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--color-text-muted)' }}>最长连达</dt>
                  <dd className="font-mono-num mt-0.5 text-sm font-semibold">
                    {consistency.bestStreak}周
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-3 flex h-7 w-full items-stretch gap-0.5">
              {consistency.weeks.map((w) => {
                const bg =
                  w.status === 'hit'
                    ? 'var(--color-brand)'
                    : w.status === 'near'
                      ? '#d97706'
                      : 'var(--color-border)';
                return (
                  <div
                    key={w.weekStart}
                    title={`${w.weekStart} 周：${w.count} 次 · ${w.hours}h · ${w.kcal} kcal`}
                    className="flex-1 rounded-xs transition-opacity hover:opacity-75"
                    style={{ backgroundColor: bg }}
                  />
                );
              })}
            </div>
          </div>

          <div
            className="mt-3 flex items-center gap-4 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-xs"
                style={{ backgroundColor: 'var(--color-brand)' }}
              />
              达标
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-xs"
                style={{ backgroundColor: '#d97706' }}
              />
              差 1 次
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-xs"
                style={{ backgroundColor: 'var(--color-border)' }}
              />
              休整
            </span>
          </div>
        </section>
      </div>

      {/* 3. HR Load by Sport + Day-of-Week Rhythm */}
      <div
        className="grid grid-cols-1 gap-8 border-b pb-7 xl:grid-cols-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">
            心率负荷区间（均 → 峰 bpm）
          </h2>

          {hrBySport.length ? (
            <div className="space-y-3">
              {hrBySport.map((r) => {
                const pct = (v: number) =>
                  Math.max(0, Math.min(100, ((v - 100) / 100) * 100));
                const left = pct(r.avgHr);
                const right = pct(r.avgMaxHr);
                return (
                  <div key={r.sport} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.label}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          ({r.count})
                        </span>
                      </span>
                      <span
                        className="font-mono-num"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        <strong style={{ color: 'var(--color-text)' }}>
                          {r.avgHr}
                        </strong>
                        {' → '}
                        <strong
                          style={{
                            color:
                              r.avgMaxHr >= 170
                                ? '#ea580c'
                                : 'var(--color-text)',
                          }}
                        >
                          {r.avgMaxHr}
                        </strong>
                        <span className="ml-1.5 opacity-75">
                          max {r.peakHr}
                        </span>
                      </span>
                    </div>
                    <div
                      className="relative h-2 w-full rounded-full"
                      style={{ backgroundColor: 'var(--color-surface-subtle)' }}
                    >
                      <div
                        className="absolute top-0 bottom-0 rounded-full opacity-80"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(2, right - left)}%`,
                          backgroundColor: r.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {hrZoneTotals.syncedCount > 0 && (
                <div
                  className="mt-4 border-t pt-3"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium">心率区间（Z1–Z5）</span>
                    <span
                      className="font-mono-num"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {hrZoneTotals.syncedCount} 条区间记录
                    </span>
                  </div>
                  <CategoryBar
                    segments={hrZoneTotals.totals.map((val, i) => ({
                      key: `z${i + 1}`,
                      label: HR_ZONE_LABELS[i],
                      value: val,
                      color: HR_ZONE_COLORS[i],
                    }))}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              暂无心率数据
            </p>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              训练时段分布
            </h2>
            <span
              className="font-mono-num text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              早 9 点前 {rhythm.morningPct}%
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="w-20" />
                  {rhythm.days.map((d) => (
                    <th
                      key={d}
                      className="pb-1 text-center font-normal"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      周{d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rhythm.buckets.map((bucket, bi) => (
                  <tr key={bucket}>
                    <th
                      scope="row"
                      className="pr-2 text-right font-normal whitespace-nowrap"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {bucket}
                    </th>
                    {rhythm.days.map((d, di) => {
                      const val = rhythm.cells[bi][di];
                      const mixPct =
                        val === 0
                          ? 0
                          : Math.round(18 + 82 * (val / rhythm.maxCount));
                      return (
                        <td
                          key={d}
                          className="font-mono-num h-7 rounded-sm text-center font-medium"
                          style={{
                            backgroundColor: val
                              ? `color-mix(in oklab, var(--color-brand) ${mixPct}%, var(--color-surface-subtle))`
                              : 'var(--color-surface-subtle)',
                            color:
                              val && mixPct >= 62
                                ? 'var(--color-brand-ink)'
                                : 'var(--color-text)',
                          }}
                        >
                          {val || ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 4. Personal Records — Flat Editorial Grid (No nested cards!) */}
      {records.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">
            个人纪录
          </h2>
          <dl
            className="grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-4 sm:grid-cols-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {records.map((rec) => (
              <div key={rec.id} className="min-w-0">
                <dt
                  className="text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {rec.label}
                </dt>
                <dd className="font-mono-num mt-1 text-xl font-semibold tracking-tight">
                  {rec.value}
                </dd>
                <dd
                  className="mt-0.5 truncate text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={rec.detail}
                >
                  {rec.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
};

export default TrainingInsights;
