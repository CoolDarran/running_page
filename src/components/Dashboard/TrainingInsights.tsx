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

const YEAR_LINE_COLORS = ['#10b981', '#38bdf8', '#a855f7', '#94a3b8'];
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

  // Aggregate real Strava Z1-Z5 HR zones if present on activities
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

  const acwrStatus = useMemo(() => {
    if (!fitness.latest) return null;
    const { acwr } = fitness.latest;
    if (acwr > 1.35) {
      return {
        label: '负荷偏高 · 注意恢复',
        color: '#f97316',
        bg: 'rgba(249,115,22,0.14)',
      };
    }
    if (acwr >= 0.8) {
      return {
        label: '理想进阶区',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.14)',
      };
    }
    return {
      label: '减量 / 恢复期',
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.14)',
    };
  }, [fitness.latest]);

  const consistencyPct = consistency.totalWeeks
    ? (consistency.hitWeeks / consistency.totalWeeks) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* 1. Fitness & Fatigue (TRIMP -> CTL / ATL / TSB) */}
      <section
        className="rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">
                体能与疲劳曲线（TRIMP · 近 180 天）
              </h3>
              {acwrStatus && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: acwrStatus.bg,
                    color: acwrStatus.color,
                  }}
                >
                  {acwrStatus.label} · ACWR {fitness.latest?.acwr}
                </span>
              )}
            </div>
            <p
              className="mt-0.5 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              基于时长与心率储备估算训练冲量（HRmax≈{fitness.hrMaxEstimate}{' '}
              bpm），不依赖 GPS 距离即可追踪 CrossFit / Hyrox 体能积累
            </p>
          </div>
          <MetricExplainer
            title="训练负荷模型说明"
            items={[
              {
                term: 'CTL 长期体能',
                desc: '42 天指数平均负荷，反映有氧与综合体能底子。',
                color: '#10b981',
              },
              {
                term: 'ATL 短期疲劳',
                desc: '7 天指数平均负荷，反映最近一周的急性训练压力。',
                color: '#f97316',
              },
              {
                term: 'TSB 状态值',
                desc: 'CTL − ATL。正值代表恢复充分、状态佳；持续低于 −20 需防过度训练。',
                color: '#38bdf8',
              },
              {
                term: 'ACWR 负荷比',
                desc: 'ATL / CTL。0.8–1.3 为安全进阶区间，超过 1.35 建议安排恢复日。',
              },
            ]}
          />
        </div>

        {fitness.latest && (
          <div className="mb-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            <div
              className="rounded-lg border px-3 py-2"
              style={{
                backgroundColor: 'var(--color-surface-subtle)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                CTL 体能
              </div>
              <div
                className="mt-0.5 text-lg font-bold tabular-nums"
                style={{ color: '#10b981' }}
              >
                {fitness.latest.ctl}
              </div>
            </div>
            <div
              className="rounded-lg border px-3 py-2"
              style={{
                backgroundColor: 'var(--color-surface-subtle)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ATL 疲劳
              </div>
              <div
                className="mt-0.5 text-lg font-bold tabular-nums"
                style={{ color: '#f97316' }}
              >
                {fitness.latest.atl}
              </div>
            </div>
            <div
              className="rounded-lg border px-3 py-2"
              style={{
                backgroundColor: 'var(--color-surface-subtle)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                TSB 状态
              </div>
              <div
                className="mt-0.5 text-lg font-bold tabular-nums"
                style={{
                  color: fitness.latest.tsb >= 0 ? '#38bdf8' : '#f43f5e',
                }}
              >
                {fitness.latest.tsb > 0
                  ? `+${fitness.latest.tsb}`
                  : fitness.latest.tsb}
              </div>
            </div>
            <div
              className="hidden rounded-lg border px-3 py-2 sm:block"
              style={{
                backgroundColor: 'var(--color-surface-subtle)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ACWR 负荷比
              </div>
              <div className="mt-0.5 text-lg font-bold tabular-nums">
                {fitness.latest.acwr}
              </div>
            </div>
          </div>
        )}

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={fitness.series}
              margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
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
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                  color: 'var(--color-text)',
                }}
              />
              <Area
                type="monotone"
                dataKey="tsb"
                name="TSB 状态"
                stroke="#38bdf8"
                fill="#38bdf8"
                fillOpacity={0.12}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="ctl"
                name="CTL 体能"
                stroke="#10b981"
                strokeWidth={2.2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="atl"
                name="ATL 疲劳"
                stroke="#f97316"
                strokeWidth={1.8}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2. YTD Cumulative Comparison + Weekly Consistency Tracker */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* YTD Comparison (7 cols) */}
        <section
          className="rounded-xl border p-4 xl:col-span-7"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">跨年累计进度对比（YTD）</h3>
              <p
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                同日历进度下，对比近 {ytd.years.length} 年的累计训练投入
              </p>
            </div>
            <div
              className="inline-flex rounded-lg border p-0.5 text-xs"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface-subtle)',
              }}
            >
              {(
                [
                  ['hours', '时长 h'],
                  ['kcal', '消耗 kcal'],
                  ['count', '次数'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setYtdMetric(key)}
                  className="rounded-md px-2 py-1 font-medium transition-colors"
                  style={
                    ytdMetric === key
                      ? {
                          backgroundColor: 'var(--color-brand)',
                          color: '#ffffff',
                        }
                      : { color: 'var(--color-text-muted)' }
                  }
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
                margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
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
                    borderRadius: '0.75rem',
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
                    strokeWidth={idx === 0 ? 2.6 : 1.6}
                    strokeDasharray={idx >= 2 ? '4 3' : undefined}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div
            className="mt-2 flex flex-wrap gap-3 border-t pt-2 text-xs tabular-nums"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            {ytd.years.map((yr, idx) => (
              <span key={yr} className="inline-flex items-center gap-1.5">
                <span
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
                      : `${ytd.yearTotals[yr]} 次`}
                </span>
              </span>
            ))}
          </div>
        </section>

        {/* Weekly Consistency Tracker (5 cols, Tremor + Bencho style) */}
        <section
          className="flex flex-col justify-between rounded-xl border p-4 xl:col-span-5"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">周目标一致性 Tracker</h3>
                <p
                  className="text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {year === 'Total' ? '近 52 周' : `${year} 年`} · 每周目标 ≥{' '}
                  {weeklyTarget} 练
                </p>
              </div>
              <div
                className="inline-flex rounded-lg border p-0.5 text-xs"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-surface-subtle)',
                }}
              >
                {[2, 3, 4].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setWeeklyTarget(t)}
                    className="rounded-md px-2 py-0.5 font-medium tabular-nums"
                    style={
                      weeklyTarget === t
                        ? {
                            backgroundColor: 'var(--color-brand)',
                            color: '#ffffff',
                          }
                        : { color: 'var(--color-text-muted)' }
                    }
                  >
                    {t}次
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 py-1">
              <ArcRing percent={consistencyPct} size={68} strokeWidth={6} />
              <div className="grid flex-1 grid-cols-2 gap-2 text-xs">
                <div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    达标周数
                  </div>
                  <div className="text-base font-bold tabular-nums">
                    {consistency.hitWeeks} / {consistency.totalWeeks}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    最长连达
                  </div>
                  <div className="text-base font-bold tabular-nums">
                    {consistency.bestStreak} 周
                  </div>
                </div>
                <div className="col-span-2">
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    当前连续达标：
                  </span>
                  <strong
                    className="tabular-nums"
                    style={{ color: 'var(--color-brand)' }}
                  >
                    {consistency.currentStreak} 周
                  </strong>
                </div>
              </div>
            </div>

            {/* Tremor-style Tracker Strip */}
            <div className="flex h-8 w-full items-stretch gap-0.5 pt-1">
              {consistency.weeks.map((w) => {
                const bg =
                  w.status === 'hit'
                    ? '#10b981'
                    : w.status === 'near'
                      ? '#f59e0b'
                      : 'var(--color-border)';
                return (
                  <div
                    key={w.weekStart}
                    title={`${w.weekStart} 周：${w.count} 次 · ${w.hours}h · ${w.kcal} kcal`}
                    className="flex-1 rounded-sm transition-opacity hover:opacity-75"
                    style={{ backgroundColor: bg }}
                  />
                );
              })}
            </div>
          </div>

          <div
            className="mt-3 flex items-center justify-between border-t pt-2 text-xs"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                达标
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber-500" />差 1 次
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: 'var(--color-border)' }}
                />
                休整
              </span>
            </div>
            <span>悬停查看每周明细</span>
          </div>
        </section>
      </div>

      {/* 3. HR Load by Sport + Rhythm Heatmap */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section
          className="rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="mb-3">
            <h3 className="text-sm font-semibold">各项目心率负荷对比</h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              平均心率 → 平均峰值心率区间（括号内为历史最高极值）
            </p>
          </div>

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
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.label}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          ({r.count})
                        </span>
                      </span>
                      <span
                        className="tabular-nums"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        均{' '}
                        <strong style={{ color: 'var(--color-text)' }}>
                          {r.avgHr}
                        </strong>{' '}
                        → 峰{' '}
                        <strong
                          style={{
                            color:
                              r.avgMaxHr >= 170
                                ? '#f97316'
                                : 'var(--color-text)',
                          }}
                        >
                          {r.avgMaxHr}
                        </strong>{' '}
                        bpm{' '}
                        <span className="opacity-70">(极值 {r.peakHr})</span>
                      </span>
                    </div>
                    <div
                      className="relative h-2.5 w-full rounded-full border"
                      style={{
                        backgroundColor: 'var(--color-surface-subtle)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <div
                        className="absolute top-0 bottom-0 rounded-full opacity-75"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(2, right - left)}%`,
                          backgroundColor: r.color,
                        }}
                      />
                      <span
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ left: `${left}%`, backgroundColor: r.color }}
                      />
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                        style={{
                          left: `${right}%`,
                          backgroundColor: r.color,
                          borderColor: 'var(--color-surface)',
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
                    <span className="font-semibold">
                      Strava 心率区间分布（Z1–Z5）
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      来自 {hrZoneTotals.syncedCount} 条已同步区间数据
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
            <div
              className="py-8 text-center text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              当前筛选下无心率数据
            </div>
          )}
        </section>

        {/* Rhythm Matrix */}
        <section
          className="rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">训练节律（星期 × 时段）</h3>
              <p
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                按开始时间统计最常训练的窗口
              </p>
            </div>
            <span
              className="rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface-subtle)',
              }}
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
                      className="pb-1 text-center font-medium"
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
                    <td
                      className="pr-2 text-right whitespace-nowrap"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {bucket}
                    </td>
                    {rhythm.days.map((d, di) => {
                      const val = rhythm.cells[bi][di];
                      const op =
                        val === 0 ? 0 : 0.18 + 0.82 * (val / rhythm.maxCount);
                      return (
                        <td
                          key={d}
                          className="h-8 rounded-md border text-center font-semibold tabular-nums"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: val
                              ? `rgba(16, 185, 129, ${op.toFixed(2)})`
                              : 'var(--color-surface-subtle)',
                            color:
                              val && op > 0.55
                                ? '#ffffff'
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

      {/* 4. Personal Records (PR) Wall */}
      {records.length > 0 && (
        <section
          className="rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">个人纪录墙 & 里程碑</h3>
              <p
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                面向室内体能与多运动场景的专属高光纪录
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border p-3"
                style={{
                  backgroundColor: 'var(--color-surface-subtle)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div
                  className="text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {rec.label}
                </div>
                <div
                  className="mt-1 text-xl font-extrabold tabular-nums"
                  style={{ color: rec.accent ?? 'var(--color-text)' }}
                >
                  {rec.value}
                </div>
                <div
                  className="mt-1 truncate text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={rec.detail}
                >
                  {rec.detail}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default TrainingInsights;
