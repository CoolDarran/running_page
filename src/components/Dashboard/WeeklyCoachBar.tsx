import { useMemo } from 'react';
import type { Activity } from '@/utils/utils';
import { PILLAR_META, TRAINING_GOALS } from '@/utils/trainingGoals';
import { computeWeeklyCoach } from '@/utils/workoutAnalytics';

interface WeeklyCoachBarProps {
  allActivities: Activity[];
  onOpenInsights?: () => void;
}

const TONE_COLOR = {
  ok: 'var(--color-brand)',
  focus: '#d97706',
  warn: '#ea580c',
} as const;

const WeeklyCoachBar = ({
  allActivities,
  onOpenInsights,
}: WeeklyCoachBarProps) => {
  const coach = useMemo(
    () => computeWeeklyCoach(allActivities),
    [allActivities]
  );

  if (!coach) return null;

  const daysPct = Math.min(
    100,
    Math.round((coach.activeDays / TRAINING_GOALS.weeklyTargetDays) * 100)
  );
  const floorMarkPct = Math.round(
    (TRAINING_GOALS.weeklyFloorDays / TRAINING_GOALS.weeklyTargetDays) * 100
  );
  const kcalPct = Math.min(
    100,
    Math.round((coach.kcal / TRAINING_GOALS.weeklyTargetKcal) * 100)
  );

  const rollingTotal =
    coach.rolling4w.metcon + coach.rolling4w.strength + coach.rolling4w.aerobic;
  const strengthLow =
    coach.rolling4w.strength < TRAINING_GOALS.rolling4wMinStrength;
  const aerobicLow =
    coach.rolling4w.aerobic < TRAINING_GOALS.rolling4wMinAerobic;

  return (
    <section
      aria-label="本周训练进度与建议"
      className="border-b pb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Top Actionable Coaching Line */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
            style={{ backgroundColor: TONE_COLOR[coach.advice.tone] }}
          />
          <span
            className="shrink-0 text-xs font-semibold"
            style={{ color: TONE_COLOR[coach.advice.tone] }}
          >
            {coach.advice.tag}
          </span>
          <p className="text-sm font-semibold tracking-tight">
            {coach.advice.headline}
          </p>
        </div>

        <div
          className="font-mono-num flex shrink-0 items-center gap-3 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {coach.acwr !== null && <span>ACWR {coach.acwr}</span>}
          {coach.consecutiveDays > 0 && (
            <span>连练 {coach.consecutiveDays} 天</span>
          )}
          {onOpenInsights && (
            <button
              type="button"
              onClick={onOpenInsights}
              className="underline underline-offset-4 transition-opacity hover:opacity-80"
              style={{ color: 'var(--color-text)' }}
            >
              深度分析 →
            </button>
          )}
        </div>
      </div>

      <p
        className="mt-1 pl-[18px] text-xs leading-relaxed"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {coach.advice.detail}
      </p>

      {/* 3-Pillar Weekly Progress Strip */}
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {/* 1. Consistency: Active Days */}
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>
              {coach.weekLabel}出勤
            </span>
            <span className="font-mono-num">
              <strong style={{ color: 'var(--color-text)' }}>
                {coach.activeDays}
              </strong>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {' '}
                / {TRAINING_GOALS.weeklyTargetDays} 天
              </span>
            </span>
          </div>
          <div
            className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--color-surface-subtle)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${daysPct}%`,
                backgroundColor:
                  coach.activeDays >= TRAINING_GOALS.weeklyFloorDays
                    ? 'var(--color-brand)'
                    : '#d97706',
              }}
            />
            <span
              aria-hidden="true"
              title={`保底线：${TRAINING_GOALS.weeklyFloorDays} 天`}
              className="absolute top-0 bottom-0 w-px"
              style={{
                left: `${floorMarkPct}%`,
                backgroundColor: 'var(--color-text-muted)',
                opacity: 0.7,
              }}
            />
          </div>
          <div
            className="font-mono-num mt-1 flex justify-between text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span>
              保底 {TRAINING_GOALS.weeklyFloorDays} 天 · {coach.hours}h
            </span>
            <span>近4周达标 {coach.rolling4w.floorHitRatePct}%</span>
          </div>
        </div>

        {/* 2. Fat Loss: Weekly Active Calories */}
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>
              {coach.weekLabel}消耗
            </span>
            <span className="font-mono-num">
              <strong style={{ color: 'var(--color-text)' }}>
                {coach.kcal.toLocaleString()}
              </strong>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {' '}
                / {TRAINING_GOALS.weeklyTargetKcal.toLocaleString()} kcal
              </span>
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--color-surface-subtle)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${kcalPct}%`,
                backgroundColor:
                  coach.kcal >= TRAINING_GOALS.weeklyTargetKcal
                    ? 'var(--color-brand)'
                    : '#f59e0b',
              }}
            />
          </div>
          <div
            className="font-mono-num mt-1 flex justify-between text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span>进度 {kcalPct}%</span>
            <span>
              近4周均 {coach.rolling4w.avgWeeklyKcal.toLocaleString()} kcal
            </span>
          </div>
        </div>

        {/* 3. Recomposition Balance: Rolling 4-Week Triangle */}
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span style={{ color: 'var(--color-text-muted)' }}>
              近 4 周结构
            </span>
            <span
              className="font-mono-num"
              style={{ color: 'var(--color-text-muted)' }}
            >
              共 {rollingTotal} 练
            </span>
          </div>
          <div
            className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--color-surface-subtle)' }}
          >
            {(
              [
                ['metcon', coach.rolling4w.metcon],
                ['strength', coach.rolling4w.strength],
                ['aerobic', coach.rolling4w.aerobic],
              ] as const
            ).map(([key, count]) =>
              count > 0 && rollingTotal > 0 ? (
                <div
                  key={key}
                  style={{
                    width: `${(count / rollingTotal) * 100}%`,
                    backgroundColor: PILLAR_META[key].color,
                  }}
                />
              ) : null
            )}
          </div>
          <div
            className="font-mono-num mt-1 flex items-center justify-between gap-2 text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <span>代谢 {coach.rolling4w.metcon}</span>
            <span style={{ color: strengthLow ? '#ea580c' : undefined }}>
              力量 {coach.rolling4w.strength}
              {strengthLow ? '↓' : ''}
            </span>
            <span style={{ color: aerobicLow ? '#ea580c' : undefined }}>
              有氧 {coach.rolling4w.aerobic}
              {aerobicLow ? '↓' : ''}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WeeklyCoachBar;
