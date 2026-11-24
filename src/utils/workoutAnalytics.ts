import { convertMovingTime2Sec, type Activity } from './utils';
import {
  classifySubSport,
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from './workoutTaxonomy';
import {
  classifyTrainingPillar,
  PILLAR_META,
  TRAINING_GOALS,
  type TrainingPillar,
} from './trainingGoals';

export function getActivityMinutes(activity: Activity): number {
  return convertMovingTime2Sec(activity.moving_time) / 60;
}

export function getElapsedMinutes(activity: Activity): number {
  if (!activity.elapsed_time) return getActivityMinutes(activity);
  return convertMovingTime2Sec(activity.elapsed_time) / 60;
}

export function formatDurationShort(totalMinutes: number): string {
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  if (h > 0) return `${h}h ${String(rem).padStart(2, '0')}m`;
  return `${rem}m`;
}

export function parseHrZones(activity: Activity): number[] | null {
  if (!activity.hr_zones) return null;
  try {
    const parsed = JSON.parse(activity.hr_zones);
    if (Array.isArray(parsed) && parsed.length >= 5) {
      return parsed.slice(0, 5).map((v) => Number(v) || 0);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Training load (TRIMP) estimate:
 * 1) Strava Relative Effort (suffer_score) when present
 * 2) Edwards HR-Zone TRIMP (weighted minutes across Z1-Z5, scaled to match Banister range)
 * 3) Banister exponential HRR TRIMP using moving duration + avg HR
 * 4) Calorie / duration fallback
 */
export function calculateTrimp(
  activity: Activity,
  hrRest = 55,
  hrMax = 192
): number {
  if (activity.suffer_score && activity.suffer_score > 0) {
    return Math.round(activity.suffer_score);
  }

  const zones = parseHrZones(activity);
  if (zones) {
    const totalSec = zones.reduce((s, v) => s + v, 0);
    if (totalSec > 0) {
      // Edwards TRIMP: sum(minutes_in_zone * zone_weight[1..5]) * 0.55 to align scale with Banister TRIMP
      const edwards =
        (zones[0] * 1 +
          zones[1] * 2 +
          zones[2] * 3 +
          zones[3] * 4 +
          zones[4] * 5) /
        60;
      return Math.round(edwards * 0.55);
    }
  }

  const minutes = getActivityMinutes(activity);
  if (minutes <= 0) return 0;

  const avgHr = activity.average_heartrate;
  if (avgHr && avgHr > hrRest) {
    const hrr = Math.max(0, Math.min(1, (avgHr - hrRest) / (hrMax - hrRest)));
    // Banister male exponential weighting factor (0.64 * e^(1.92 * HRR))
    const trimp = minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
    return Math.round(trimp);
  }

  if (activity.calories && activity.calories > 0) {
    return Math.round(activity.calories / 8);
  }

  return Math.round(minutes * 0.7);
}

export interface FitnessPoint {
  date: string;
  label: string;
  trimp: number;
  ctl: number; // 42-day Fitness
  atl: number; // 7-day Fatigue
  tsb: number; // Form = CTL - ATL
  acwr: number; // ATL / CTL ratio
}

export interface FitnessSummary {
  series: FitnessPoint[];
  latest: FitnessPoint | null;
  trimp7d: number;
  hrMaxEstimate: number;
}

export function computeFitnessSeries(
  allActivities: Activity[],
  windowDays = 180
): FitnessSummary {
  if (!allActivities.length) {
    return { series: [], latest: null, trimp7d: 0, hrMaxEstimate: 192 };
  }

  const observedPeak = allActivities.reduce(
    (m, a) => Math.max(m, a.max_heartrate || 0),
    0
  );
  const hrMax = Math.max(190, Math.min(205, Math.round(observedPeak || 192)));

  const dailyTrimp = new Map<string, number>();
  let minDate = '';
  let maxDate = '';

  allActivities.forEach((a) => {
    const d = a.start_date_local.slice(0, 10);
    if (!d) return;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
    const t = calculateTrimp(a, 55, hrMax);
    dailyTrimp.set(d, (dailyTrimp.get(d) || 0) + t);
  });

  if (!minDate || !maxDate) {
    return { series: [], latest: null, trimp7d: 0, hrMaxEstimate: hrMax };
  }

  // Only simulate from 120 days before the window start for fast warm-up
  const endObj = new Date(`${maxDate}T12:00:00`);
  const warmupStart = new Date(
    endObj.getTime() - (windowDays + 120) * 86400000
  );
  const dataStart = new Date(`${minDate}T12:00:00`);
  const startObj = warmupStart > dataStart ? warmupStart : dataStart;
  const displayStart = new Date(endObj.getTime() - windowDays * 86400000);

  let ctl = 0;
  let atl = 0;
  const ctlAlpha = 1 / 42;
  const atlAlpha = 1 / 7;
  const series: FitnessPoint[] = [];

  for (
    let cur = new Date(startObj);
    cur <= endObj;
    cur = new Date(cur.getTime() + 86400000)
  ) {
    const iso = cur.toISOString().slice(0, 10);
    const trimp = dailyTrimp.get(iso) || 0;
    const tsb = ctl - atl; // Form entering the day
    ctl = ctl + (trimp - ctl) * ctlAlpha;
    atl = atl + (trimp - atl) * atlAlpha;
    const acwr = ctl >= 5 ? atl / ctl : 1;

    if (cur >= displayStart) {
      series.push({
        date: iso,
        label: iso.slice(5),
        trimp,
        ctl: Number(ctl.toFixed(1)),
        atl: Number(atl.toFixed(1)),
        tsb: Number(tsb.toFixed(1)),
        acwr: Number(acwr.toFixed(2)),
      });
    }
  }

  const trimp7d = series.slice(-7).reduce((sum, point) => sum + point.trimp, 0);

  return {
    series,
    latest: series.length ? series[series.length - 1] : null,
    trimp7d: Math.round(trimp7d),
    hrMaxEstimate: hrMax,
  };
}

export type YtdMetric = 'hours' | 'kcal' | 'count';

export interface YtdComparisonData {
  years: string[];
  points: Array<Record<string, number | string | null>>;
  yearTotals: Record<string, number>;
}

const getDayOfYear = (dateStr: string): number => {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86400000) + 1;
};

export function computeYtdComparison(
  allActivities: Activity[],
  metric: YtdMetric = 'hours',
  maxYears = 4
): YtdComparisonData {
  const yearCounts = new Map<string, number>();
  allActivities.forEach((a) => {
    const y = a.start_date_local.slice(0, 4);
    yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
  });

  const years = Array.from(yearCounts.keys())
    .filter((y) => (yearCounts.get(y) || 0) >= 5)
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, maxYears);

  if (!years.length) {
    return { years: [], points: [], yearTotals: {} };
  }

  const latestYear = years[0];
  let latestDoyInCurrentYear = 365;
  const byYearBucket = new Map<string, number[]>();
  years.forEach((y) => byYearBucket.set(y, Array(367).fill(0)));

  allActivities.forEach((a) => {
    const y = a.start_date_local.slice(0, 4);
    if (!byYearBucket.has(y)) return;
    const doy = Math.min(366, Math.max(1, getDayOfYear(a.start_date_local)));
    const val =
      metric === 'hours'
        ? getActivityMinutes(a) / 60
        : metric === 'kcal'
          ? a.calories || 0
          : 1;
    byYearBucket.get(y)![doy] += val;
  });

  // Determine cutoff day for the latest year so line stops cleanly at latest workout
  const latestYearActs = allActivities.filter((a) =>
    a.start_date_local.startsWith(latestYear)
  );
  if (latestYearActs.length) {
    latestDoyInCurrentYear = latestYearActs.reduce(
      (m, a) => Math.max(m, getDayOfYear(a.start_date_local)),
      1
    );
  }

  const running: Record<string, number> = {};
  const yearTotals: Record<string, number> = {};
  years.forEach((y) => {
    running[y] = 0;
    yearTotals[y] = 0;
  });

  const points: Array<Record<string, number | string | null>> = [];
  const monthNames = [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ];

  // Emit 73 evenly spaced checkpoints (every 5 days + Dec 31) for crisp performance
  for (let d = 1; d <= 365; d++) {
    years.forEach((y) => {
      running[y] += byYearBucket.get(y)![d] || 0;
    });
    if (d % 5 === 0 || d === 1 || d === 365 || d === latestDoyInCurrentYear) {
      const approxDate = new Date(Date.UTC(2025, 0, d));
      const label =
        approxDate.getUTCDate() <= 5
          ? monthNames[approxDate.getUTCMonth()]
          : `${approxDate.getUTCMonth() + 1}/${approxDate.getUTCDate()}`;
      const row: Record<string, number | string | null> = { doy: d, label };
      years.forEach((y) => {
        if (y === latestYear && d > latestDoyInCurrentYear) {
          row[y] = null;
        } else {
          row[y] =
            metric === 'hours'
              ? Number(running[y].toFixed(1))
              : Math.round(running[y]);
        }
      });
      points.push(row);
    }
  }

  years.forEach((y) => {
    yearTotals[y] =
      metric === 'hours'
        ? Number(running[y].toFixed(1))
        : Math.round(running[y]);
  });

  return { years, points, yearTotals };
}

export type ConsistencyTargetMode = 'sessions' | 'kcal';

export interface WeekConsistencyItem {
  weekStart: string;
  count: number;
  activeDays: number;
  hours: number;
  kcal: number;
  status: 'hit' | 'near' | 'rest';
}

export interface WeeklyConsistencySummary {
  weeks: WeekConsistencyItem[];
  hitWeeks: number;
  totalWeeks: number;
  currentStreak: number;
  bestStreak: number;
  targetValue: number;
  targetMode: ConsistencyTargetMode;
}

export function computeWeeklyConsistency(
  activities: Activity[],
  targetValue = 3,
  maxWeeks = 52,
  targetMode: ConsistencyTargetMode = 'sessions'
): WeeklyConsistencySummary {
  if (!activities.length) {
    return {
      weeks: [],
      hitWeeks: 0,
      totalWeeks: 0,
      currentStreak: 0,
      bestStreak: 0,
      targetValue,
      targetMode,
    };
  }

  const getMondayIso = (dateStr: string) => {
    const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
    const diff = (d.getDay() + 6) % 7;
    const mon = new Date(d.getTime() - diff * 86400000);
    return mon.toISOString().slice(0, 10);
  };

  const sorted = activities
    .slice()
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  const lastMon = new Date(
    `${getMondayIso(sorted[sorted.length - 1].start_date_local)}T12:00:00`
  );
  const firstMon = new Date(
    `${getMondayIso(sorted[0].start_date_local)}T12:00:00`
  );
  const windowStart = new Date(
    lastMon.getTime() - (maxWeeks - 1) * 7 * 86400000
  );
  const startMon = windowStart > firstMon ? windowStart : firstMon;

  const map = new Map<
    string,
    { count: number; days: Set<string>; hours: number; kcal: number }
  >();
  for (
    let cur = new Date(startMon);
    cur <= lastMon;
    cur = new Date(cur.getTime() + 7 * 86400000)
  ) {
    map.set(cur.toISOString().slice(0, 10), {
      count: 0,
      days: new Set(),
      hours: 0,
      kcal: 0,
    });
  }

  sorted.forEach((a) => {
    const k = getMondayIso(a.start_date_local);
    const entry = map.get(k);
    if (entry) {
      entry.count += 1;
      entry.days.add(a.start_date_local.slice(0, 10));
      entry.hours += getActivityMinutes(a) / 60;
      entry.kcal += a.calories || 0;
    }
  });

  const weeks: WeekConsistencyItem[] = Array.from(map.entries()).map(
    ([weekStart, v]) => {
      const kcal = Math.round(v.kcal);
      let status: 'hit' | 'near' | 'rest';
      if (targetMode === 'kcal') {
        status =
          kcal >= targetValue
            ? 'hit'
            : kcal >= Math.round(targetValue * 0.75)
              ? 'near'
              : 'rest';
      } else {
        status =
          v.count >= targetValue
            ? 'hit'
            : v.count >= Math.max(1, targetValue - 1)
              ? 'near'
              : 'rest';
      }
      return {
        weekStart,
        count: v.count,
        activeDays: v.days.size,
        hours: Number(v.hours.toFixed(1)),
        kcal,
        status,
      };
    }
  );

  let bestStreak = 0;
  let runningStreak = 0;
  weeks.forEach((w) => {
    if (w.status === 'hit') {
      runningStreak += 1;
      if (runningStreak > bestStreak) bestStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  });

  // Current streak counts backward from latest complete or hit week
  let currentStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].status === 'hit') {
      currentStreak += 1;
    } else if (i === weeks.length - 1 && weeks[i].count > 0) {
      // Current week still in progress; allow checking previous week
      continue;
    } else {
      break;
    }
  }

  const hitWeeks = weeks.filter((w) => w.status === 'hit').length;
  return {
    weeks,
    hitWeeks,
    totalWeeks: weeks.length,
    currentStreak,
    bestStreak,
    targetValue,
    targetMode,
  };
}

export interface HrSportLoad {
  sport: string;
  label: string;
  color: string;
  count: number;
  avgHr: number;
  avgMaxHr: number;
  peakHr: number;
  avgTrimp: number;
}

export function computeHrLoadBySport(
  activities: Activity[],
  mode: TaxonomyMode = 'sub'
): HrSportLoad[] {
  const map = new Map<
    string,
    {
      count: number;
      hrSum: number;
      mhrSum: number;
      mhrCount: number;
      peakHr: number;
      trimpSum: number;
    }
  >();

  activities.forEach((a) => {
    if (!a.average_heartrate || a.average_heartrate <= 0) return;
    const sport = getActivityCategory(a, mode);
    if (!map.has(sport)) {
      map.set(sport, {
        count: 0,
        hrSum: 0,
        mhrSum: 0,
        mhrCount: 0,
        peakHr: 0,
        trimpSum: 0,
      });
    }
    const g = map.get(sport)!;
    g.count += 1;
    g.hrSum += a.average_heartrate;
    if (a.max_heartrate && a.max_heartrate > 0) {
      g.mhrSum += a.max_heartrate;
      g.mhrCount += 1;
      g.peakHr = Math.max(g.peakHr, Math.round(a.max_heartrate));
    }
    g.trimpSum += calculateTrimp(a);
  });

  return Array.from(map.entries())
    .map(([sport, g]) => {
      const meta = getSportMeta(sport);
      const avgHr = Math.round(g.hrSum / g.count);
      const avgMaxHr = g.mhrCount ? Math.round(g.mhrSum / g.mhrCount) : avgHr;
      return {
        sport,
        label: meta.label,
        color: meta.color,
        count: g.count,
        avgHr,
        avgMaxHr,
        peakHr: g.peakHr || avgMaxHr,
        avgTrimp: Math.round(g.trimpSum / g.count),
      };
    })
    .sort((a, b) => b.avgMaxHr - a.avgMaxHr);
}

export interface RhythmMatrix {
  buckets: string[];
  days: string[];
  cells: number[][];
  maxCount: number;
  morningCount: number;
  morningPct: number;
}

export function computeRhythmMatrix(activities: Activity[]): RhythmMatrix {
  const buckets = [
    '早 <9点',
    '上午 9-12',
    '午间 12-14',
    '下午 14-18',
    '晚间 18-21',
    '夜 21点+',
  ];
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const cells = buckets.map(() => Array<number>(7).fill(0));
  let morningCount = 0;

  activities.forEach((a) => {
    const datePart = a.start_date_local.slice(0, 10);
    const hour = Number(a.start_date_local.slice(11, 13)) || 0;
    const dObj = new Date(`${datePart}T12:00:00`);
    const dow = (dObj.getDay() + 6) % 7;
    if (hour < 9) morningCount += 1;
    const bi =
      hour < 9
        ? 0
        : hour < 12
          ? 1
          : hour < 14
            ? 2
            : hour < 18
              ? 3
              : hour < 21
                ? 4
                : 5;
    cells[bi][dow] += 1;
  });

  const maxCount = Math.max(1, ...cells.flat());
  const morningPct = activities.length
    ? Math.round((morningCount / activities.length) * 100)
    : 0;

  return { buckets, days, cells, maxCount, morningCount, morningPct };
}

export interface PersonalRecordItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  accent?: string;
}

export function computePersonalRecords(
  activities: Activity[],
  mode: TaxonomyMode = 'sub'
): PersonalRecordItem[] {
  if (!activities.length) return [];

  let maxKcalAct: Activity | null = null;
  let longestAct: Activity | null = null;
  let peakHrAct: Activity | null = null;
  const byDayMin = new Map<string, number>();
  const byWeek = new Map<
    string,
    { hours: number; count: number; kcal: number }
  >();

  activities.forEach((a) => {
    if (!maxKcalAct || (a.calories || 0) > (maxKcalAct.calories || 0)) {
      maxKcalAct = a;
    }
    if (!longestAct || getActivityMinutes(a) > getActivityMinutes(longestAct)) {
      longestAct = a;
    }
    if (!peakHrAct || (a.max_heartrate || 0) > (peakHrAct.max_heartrate || 0)) {
      peakHrAct = a;
    }
    const dayKey = a.start_date_local.slice(0, 10);
    byDayMin.set(dayKey, (byDayMin.get(dayKey) || 0) + getActivityMinutes(a));

    const d = new Date(`${dayKey}T12:00:00`);
    const mon = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000)
      .toISOString()
      .slice(0, 10);
    const wk = byWeek.get(mon) || { hours: 0, count: 0, kcal: 0 };
    wk.hours += getActivityMinutes(a) / 60;
    wk.count += 1;
    wk.kcal += a.calories || 0;
    byWeek.set(mon, wk);
  });

  // Compute Eddington-style active-minute number (E days with >= E minutes of training)
  const dayMinutesDesc = Array.from(byDayMin.values()).sort((a, b) => b - a);
  let eddingtonMin = 0;
  for (let i = 0; i < dayMinutesDesc.length; i++) {
    if (dayMinutesDesc[i] >= i + 1) eddingtonMin = i + 1;
    else break;
  }

  // Best week by hours
  let bestWeekKey = '';
  let bestWeek = { hours: 0, count: 0, kcal: 0 };
  byWeek.forEach((v, k) => {
    if (v.hours > bestWeek.hours) {
      bestWeek = v;
      bestWeekKey = k;
    }
  });

  // Longest day streak
  const sortedDates = Array.from(byDayMin.keys()).sort();
  let bestStreak = sortedDates.length ? 1 : 0;
  let curStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(`${sortedDates[i - 1]}T12:00:00`);
    const curr = new Date(`${sortedDates[i]}T12:00:00`);
    if (Math.round((curr.getTime() - prev.getTime()) / 86400000) === 1) {
      curStreak += 1;
      if (curStreak > bestStreak) bestStreak = curStreak;
    } else {
      curStreak = 1;
    }
  }

  const records: PersonalRecordItem[] = [];
  if (maxKcalAct && (maxKcalAct as Activity).calories) {
    const a = maxKcalAct as Activity;
    records.push({
      id: 'max-kcal',
      label: '单次最高消耗',
      value: `${Math.round(a.calories || 0).toLocaleString()} kcal`,
      detail: `${a.name} · ${a.start_date_local.slice(0, 10)}`,
      accent: getSportMeta(getActivityCategory(a, mode)).color,
    });
  }
  if (longestAct) {
    const a = longestAct as Activity;
    records.push({
      id: 'longest',
      label: '单次最长时长',
      value: formatDurationShort(getActivityMinutes(a)),
      detail: `${a.name} · ${a.start_date_local.slice(0, 10)}`,
      accent: getSportMeta(getActivityCategory(a, mode)).color,
    });
  }
  if (peakHrAct && (peakHrAct as Activity).max_heartrate) {
    const a = peakHrAct as Activity;
    records.push({
      id: 'peak-hr',
      label: '历史峰值心率',
      value: `${Math.round(a.max_heartrate || 0)} bpm`,
      detail: `${a.name} · ${a.start_date_local.slice(0, 10)}`,
      accent: '#f97316',
    });
  }
  if (bestWeekKey) {
    records.push({
      id: 'best-week',
      label: '最强单周投入',
      value: `${bestWeek.hours.toFixed(1)} h`,
      detail: `${bestWeekKey} 周 · ${bestWeek.count} 次 · ${Math.round(bestWeek.kcal).toLocaleString()} kcal`,
      accent: '#10b981',
    });
  }
  records.push({
    id: 'streak',
    label: '最长连续打卡',
    value: `${bestStreak} 天`,
    detail: `覆盖 ${sortedDates.length} 个活跃训练日`,
    accent: '#38bdf8',
  });
  records.push({
    id: 'eddington',
    label: '爱丁顿训练数 (E-Min)',
    value: `E = ${eddingtonMin}`,
    detail: `至少有 ${eddingtonMin} 天单日训练 ≥ ${eddingtonMin} 分钟`,
    accent: '#a855f7',
  });

  return records;
}

export function computeDayStreak(activities: Activity[]): number {
  const dates = Array.from(
    new Set(activities.map((a) => a.start_date_local.slice(0, 10)))
  ).sort();
  if (!dates.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T12:00:00`);
    const curr = new Date(`${dates[i]}T12:00:00`);
    if (Math.round((curr.getTime() - prev.getTime()) / 86400000) === 1) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

export interface PillarSlice {
  key: TrainingPillar;
  label: string;
  shortLabel: string;
  color: string;
  examples: string;
  count: number;
  hours: number;
  kcal: number;
  sharePct: number;
  status: 'ok' | 'low';
}

export interface TrainingTriangleSummary {
  windowDays: number;
  totalSessions: number;
  totalHours: number;
  totalKcal: number;
  pillars: PillarSlice[];
  diagnosis: string;
}

export function computeTrainingTriangle(
  activities: Activity[],
  windowDays = 28
): TrainingTriangleSummary {
  if (!activities.length) {
    return {
      windowDays,
      totalSessions: 0,
      totalHours: 0,
      totalKcal: 0,
      pillars: [],
      diagnosis: '暂无近期训练数据',
    };
  }

  let maxDate = '';
  activities.forEach((a) => {
    const d = a.start_date_local.slice(0, 10);
    if (d > maxDate) maxDate = d;
  });

  const endMs = new Date(`${maxDate}T12:00:00`).getTime();
  const startMs = endMs - (windowDays - 1) * 86400000;

  const recent = activities.filter((a) => {
    const t = new Date(`${a.start_date_local.slice(0, 10)}T12:00:00`).getTime();
    return t >= startMs && t <= endMs;
  });

  const acc: Record<
    TrainingPillar,
    { count: number; hours: number; kcal: number }
  > = {
    metcon: { count: 0, hours: 0, kcal: 0 },
    strength: { count: 0, hours: 0, kcal: 0 },
    aerobic: { count: 0, hours: 0, kcal: 0 },
  };

  let totalHours = 0;
  let totalKcal = 0;

  recent.forEach((a) => {
    const pillar = classifyTrainingPillar(a);
    const hrs = getActivityMinutes(a) / 60;
    const kcal = a.calories || 0;
    acc[pillar].count += 1;
    acc[pillar].hours += hrs;
    acc[pillar].kcal += kcal;
    totalHours += hrs;
    totalKcal += kcal;
  });

  const scaleFactor = windowDays / 28;
  const minStrength = Math.max(
    1,
    Math.round(TRAINING_GOALS.rolling4wMinStrength * scaleFactor)
  );
  const minAerobic = Math.max(
    1,
    Math.round(TRAINING_GOALS.rolling4wMinAerobic * scaleFactor)
  );

  const order: TrainingPillar[] = ['metcon', 'strength', 'aerobic'];
  const pillars: PillarSlice[] = order.map((key) => {
    const meta = PILLAR_META[key];
    const g = acc[key];
    const sharePct =
      totalHours > 0 ? Math.round((g.hours / totalHours) * 100) : 0;
    let status: 'ok' | 'low' = 'ok';
    if (key === 'strength' && g.count < minStrength) status = 'low';
    if (key === 'aerobic' && g.count < minAerobic) status = 'low';
    if (key === 'metcon' && g.count === 0) status = 'low';
    return {
      key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      color: meta.color,
      examples: meta.examples,
      count: g.count,
      hours: Number(g.hours.toFixed(1)),
      kcal: Math.round(g.kcal),
      sharePct,
      status,
    };
  });

  const lowStrength = acc.strength.count < minStrength;
  const lowAerobic = acc.aerobic.count < minAerobic;
  let diagnosis = '近 4 周代谢、力量与有氧配比均衡，继续维持节奏。';
  if (lowStrength && lowAerobic) {
    diagnosis = `近 ${windowDays} 天专项力量（${acc.strength.count}次）与低中强有氧（${acc.aerobic.count}次）偏少，建议每周穿插 1 次力量保肌 + 1 次有氧燃脂恢复。`;
  } else if (lowStrength) {
    diagnosis = `近 ${windowDays} 天专项力量仅 ${acc.strength.count} 次（建议 ≥${minStrength} 次），减脂期建议每周留 1 次纯力量稳住肌肉量。`;
  } else if (lowAerobic) {
    diagnosis = `近 ${windowDays} 天有氧恢复仅 ${acc.aerobic.count} 次（建议 ≥${minAerobic} 次），补 1 次 45m 低心率有氧有助于拉高周消耗并加速恢复。`;
  }

  return {
    windowDays,
    totalSessions: recent.length,
    totalHours: Number(totalHours.toFixed(1)),
    totalKcal: Math.round(totalKcal),
    pillars,
    diagnosis,
  };
}

export interface CrossFitQuarterPoint {
  quarter: string;
  count: number;
  avgMinutes: number;
  avgHr: number | null;
  avgMaxHr: number | null;
  avgKcal: number;
  avgTrimp: number;
  kcalPerMin: number;
  z45Minutes: number | null;
  z2Minutes: number | null;
  zonesSynced: number;
}

export interface CrossFitTrendSummary {
  quarters: CrossFitQuarterPoint[];
  totalSessions: number;
  zonesSyncedTotal: number;
  hrDelta: number | null;
  kcalDensityDelta: number | null;
  interpretation: string;
}

export function computeCrossFitTrend(
  allActivities: Activity[],
  maxQuarters = 8
): CrossFitTrendSummary {
  const cf = allActivities.filter((a) => classifySubSport(a) === 'CrossFit');
  if (!cf.length) {
    return {
      quarters: [],
      totalSessions: 0,
      zonesSyncedTotal: 0,
      hrDelta: null,
      kcalDensityDelta: null,
      interpretation: '暂无 CrossFit 记录',
    };
  }

  const byQ = new Map<
    string,
    {
      count: number;
      minSum: number;
      hrSum: number;
      hrCount: number;
      maxHrSum: number;
      maxHrCount: number;
      kcalSum: number;
      trimpSum: number;
      z45SecSum: number;
      z2SecSum: number;
      zonesSynced: number;
    }
  >();

  let zonesSyncedTotal = 0;

  cf.forEach((a) => {
    const yr = a.start_date_local.slice(0, 4);
    const mo = Number(a.start_date_local.slice(5, 7)) || 1;
    const qKey = `${yr}-Q${Math.floor((mo - 1) / 3) + 1}`;
    if (!byQ.has(qKey)) {
      byQ.set(qKey, {
        count: 0,
        minSum: 0,
        hrSum: 0,
        hrCount: 0,
        maxHrSum: 0,
        maxHrCount: 0,
        kcalSum: 0,
        trimpSum: 0,
        z45SecSum: 0,
        z2SecSum: 0,
        zonesSynced: 0,
      });
    }
    const g = byQ.get(qKey)!;
    const mins = getActivityMinutes(a);
    g.count += 1;
    g.minSum += mins;
    g.kcalSum += a.calories || 0;
    g.trimpSum += calculateTrimp(a);
    if (a.average_heartrate && a.average_heartrate > 0) {
      g.hrSum += a.average_heartrate;
      g.hrCount += 1;
    }
    if (a.max_heartrate && a.max_heartrate > 0) {
      g.maxHrSum += a.max_heartrate;
      g.maxHrCount += 1;
    }
    const zones = parseHrZones(a);
    if (zones) {
      g.zonesSynced += 1;
      zonesSyncedTotal += 1;
      g.z2SecSum += zones[1];
      g.z45SecSum += zones[3] + zones[4];
    }
  });

  const quarters: CrossFitQuarterPoint[] = Array.from(byQ.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-maxQuarters)
    .map(([quarter, g]) => {
      const avgMinutes = g.count ? g.minSum / g.count : 0;
      const avgKcal = g.count ? g.kcalSum / g.count : 0;
      return {
        quarter,
        count: g.count,
        avgMinutes: Math.round(avgMinutes),
        avgHr: g.hrCount ? Number((g.hrSum / g.hrCount).toFixed(1)) : null,
        avgMaxHr: g.maxHrCount ? Math.round(g.maxHrSum / g.maxHrCount) : null,
        avgKcal: Math.round(avgKcal),
        avgTrimp: g.count ? Math.round(g.trimpSum / g.count) : 0,
        kcalPerMin:
          g.minSum > 0 ? Number((g.kcalSum / g.minSum).toFixed(2)) : 0,
        z45Minutes:
          g.zonesSynced > 0
            ? Number((g.z45SecSum / 60 / g.zonesSynced).toFixed(1))
            : null,
        z2Minutes:
          g.zonesSynced > 0
            ? Number((g.z2SecSum / 60 / g.zonesSynced).toFixed(1))
            : null,
        zonesSynced: g.zonesSynced,
      };
    });

  // Compare latest quarter with >= 5 sessions against earliest baseline with >= 5 sessions
  const substantial = quarters.filter((q) => q.count >= 5);
  let hrDelta: number | null = null;
  let kcalDensityDelta: number | null = null;
  let interpretation =
    '保持稳定 CrossFit 频率，持续观察单位分钟消耗与心率效率。';

  if (substantial.length >= 2) {
    const first = substantial[0];
    const last = substantial[substantial.length - 1];
    if (first.avgHr !== null && last.avgHr !== null) {
      hrDelta = Number((last.avgHr - first.avgHr).toFixed(1));
    }
    kcalDensityDelta = Number((last.kcalPerMin - first.kcalPerMin).toFixed(2));

    if (zonesSyncedTotal > 0 && last.z45Minutes !== null) {
      interpretation = `最新季度单节均 TRIMP ${last.avgTrimp}、Z4–Z5 高强 ${last.z45Minutes}m、消耗密度 ${last.kcalPerMin} kcal/min；${
        hrDelta !== null && hrDelta <= -4
          ? `均心率较 ${first.quarter} 下降 ${Math.abs(hrDelta)} bpm，结合高强时长可区分心肺适应与强度漂移。`
          : `均心率稳定在 ${last.avgHr} bpm。`
      }`;
    } else if (hrDelta !== null && hrDelta <= -5) {
      interpretation = `均心率较 ${first.quarter} 下降 ${Math.abs(hrDelta)} bpm、消耗密度 ${kcalDensityDelta >= 0 ? '+' : ''}${kcalDensityDelta} kcal/min。运行一次 Strava 历史区间回填后即可看清 Z4–Z5 有效高强时间。`;
    } else if (hrDelta !== null && hrDelta >= 4) {
      interpretation = `均心率较 ${first.quarter} 上升 +${hrDelta} bpm（${last.kcalPerMin} kcal/min），近期课上代谢刺激走高，注意穿插恢复日。`;
    }
  }

  return {
    quarters,
    totalSessions: cf.length,
    zonesSyncedTotal,
    hrDelta,
    kcalDensityDelta,
    interpretation,
  };
}

export interface WeeklyCoachSummary {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  daysLeftInWeek: number;
  activeDays: number;
  sessionCount: number;
  hours: number;
  kcal: number;
  consecutiveDays: number;
  daysSinceLastWorkout: number;
  acwr: number | null;
  tsb: number | null;
  pillarCounts: Record<TrainingPillar, number>;
  rolling4w: {
    metcon: number;
    strength: number;
    aerobic: number;
    avgWeeklyKcal: number;
    floorHitRatePct: number;
  };
  advice: {
    tone: 'ok' | 'warn' | 'focus';
    tag: string;
    headline: string;
    detail: string;
  };
}

export function computeWeeklyCoach(
  allActivities: Activity[]
): WeeklyCoachSummary | null {
  if (!allActivities.length) return null;

  const sorted = allActivities
    .slice()
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  const latestAct = sorted[sorted.length - 1];
  const latestIso = latestAct.start_date_local.slice(0, 10);

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const latestMs = new Date(`${latestIso}T12:00:00`).getTime();
  const diffFromToday = Math.round((todayMs - latestMs) / 86400000);

  // Anchor on real today when data is fresh (within 14 days), else anchor on latest activity date
  const isCurrentWeek = diffFromToday >= -1 && diffFromToday <= 14;
  const anchorIso = isCurrentWeek ? todayIso : latestIso;
  const anchorDate = new Date(`${anchorIso}T12:00:00`);
  const dow = (anchorDate.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const weekStartObj = new Date(anchorDate.getTime() - dow * 86400000);
  const weekEndObj = new Date(weekStartObj.getTime() + 6 * 86400000);
  const weekStart = weekStartObj.toISOString().slice(0, 10);
  const weekEnd = weekEndObj.toISOString().slice(0, 10);
  const daysLeftInWeek = 7 - dow; // includes today

  const weekActs = sorted.filter((a) => {
    const d = a.start_date_local.slice(0, 10);
    return d >= weekStart && d <= weekEnd;
  });

  const activeDaySet = new Set(
    weekActs.map((a) => a.start_date_local.slice(0, 10))
  );
  const activeDays = activeDaySet.size;
  const sessionCount = weekActs.length;
  const hours = Number(
    weekActs.reduce((s, a) => s + getActivityMinutes(a) / 60, 0).toFixed(1)
  );
  const kcal = Math.round(weekActs.reduce((s, a) => s + (a.calories || 0), 0));

  const pillarCounts: Record<TrainingPillar, number> = {
    metcon: 0,
    strength: 0,
    aerobic: 0,
  };
  weekActs.forEach((a) => {
    pillarCounts[classifyTrainingPillar(a)] += 1;
  });

  // Current consecutive training days ending on anchorIso or anchorIso - 1 day
  const allDates = new Set(sorted.map((a) => a.start_date_local.slice(0, 10)));
  let consecutiveDays = 0;
  const checkStartOffset = allDates.has(anchorIso) ? 0 : 1;
  for (let offset = checkStartOffset; offset < 60; offset++) {
    const dIso = new Date(anchorDate.getTime() - offset * 86400000)
      .toISOString()
      .slice(0, 10);
    if (allDates.has(dIso)) {
      consecutiveDays += 1;
    } else {
      break;
    }
  }

  const daysSinceLastWorkout = Math.max(
    0,
    Math.round((anchorDate.getTime() - latestMs) / 86400000)
  );

  const fitness = computeFitnessSeries(allActivities, 90);
  const acwr = fitness.latest ? fitness.latest.acwr : null;
  const tsb = fitness.latest ? fitness.latest.tsb : null;

  const triangle = computeTrainingTriangle(allActivities, 28);
  const rolling4wMetcon =
    triangle.pillars.find((p) => p.key === 'metcon')?.count ?? 0;
  const rolling4wStrength =
    triangle.pillars.find((p) => p.key === 'strength')?.count ?? 0;
  const rolling4wAerobic =
    triangle.pillars.find((p) => p.key === 'aerobic')?.count ?? 0;

  const recent4w = computeWeeklyConsistency(
    allActivities,
    TRAINING_GOALS.weeklyFloorDays,
    4,
    'sessions'
  );
  const avgWeeklyKcal = recent4w.weeks.length
    ? Math.round(
        recent4w.weeks.reduce((s, w) => s + w.kcal, 0) / recent4w.weeks.length
      )
    : 0;
  const floorHitRatePct = recent4w.totalWeeks
    ? Math.round((recent4w.hitWeeks / recent4w.totalWeeks) * 100)
    : 0;

  // Deterministic, actionable coaching sentence for CrossFit + Fat Loss + Consistency
  const missingDaysForFloor = Math.max(
    0,
    TRAINING_GOALS.weeklyFloorDays - activeDays
  );
  const missingDaysForTarget = Math.max(
    0,
    TRAINING_GOALS.weeklyTargetDays - activeDays
  );
  const missingKcal = Math.max(0, TRAINING_GOALS.weeklyTargetKcal - kcal);

  const missingPillarHint =
    rolling4wStrength < TRAINING_GOALS.rolling4wMinStrength
      ? '优先补 1 次专项力量保肌'
      : rolling4wAerobic < TRAINING_GOALS.rolling4wMinAerobic
        ? '补 1 次 45m 低心率有氧燃脂恢复'
        : '继续按早课节奏推进 CrossFit';

  let advice: WeeklyCoachSummary['advice'];
  if (
    consecutiveDays >= TRAINING_GOALS.consecutiveDayWarn ||
    (acwr !== null && acwr > 1.35) ||
    (tsb !== null && tsb < -20)
  ) {
    advice = {
      tone: 'warn',
      tag: '疲劳预警',
      headline:
        consecutiveDays >= TRAINING_GOALS.consecutiveDayWarn
          ? `已连练 ${consecutiveDays} 天，明天建议主动休整或 40m 低心率恢复`
          : `近期负荷比 ACWR ${acwr} 偏高，未来 1–2 天降强度防断档`,
      detail: `避免硬顶高强度引发 5–8 天被动停训；保持拉伸/快走即可维持节律。`,
    };
  } else if (daysSinceLastWorkout >= 5) {
    advice = {
      tone: 'focus',
      tag: '重启节奏',
      headline: `已休整 ${daysSinceLastWorkout} 天，今天安排 1 节中等强度课找回晨练惯性`,
      detail: `不追极限心率，完成即达标；${missingPillarHint}。`,
    };
  } else if (missingDaysForFloor > 0) {
    advice = {
      tone: 'focus',
      tag: '保底推进',
      headline: `本周还差 ${missingDaysForFloor} 天达保底线（${activeDays}/${TRAINING_GOALS.weeklyFloorDays} 天），差 ${missingKcal.toLocaleString()} kcal 达减脂线`,
      detail: `本周还剩 ${daysLeftInWeek} 天，${missingPillarHint}。`,
    };
  } else if (missingDaysForTarget > 0 || missingKcal > 0) {
    advice = {
      tone: 'ok',
      tag: '已守住保底',
      headline: `已达 ${TRAINING_GOALS.weeklyFloorDays} 天保底线${missingKcal > 0 ? `，再补 ${missingKcal.toLocaleString()} kcal 达成周减脂目标` : '，本周减脂消耗也已达标'}`,
      detail: `再加 1 次低疲劳训练可冲 ${TRAINING_GOALS.weeklyTargetDays} 天目标；${missingPillarHint}。`,
    };
  } else {
    advice = {
      tone: 'ok',
      tag: '双项达标',
      headline: `本周出勤（${activeDays} 天）与消耗（${kcal.toLocaleString()} kcal）均已达标`,
      detail: `可放心安排休息或轻松活动，保持下周早课状态；${missingPillarHint}。`,
    };
  }

  return {
    weekLabel: isCurrentWeek ? '本周' : '最近一周',
    weekStart,
    weekEnd,
    daysLeftInWeek,
    activeDays,
    sessionCount,
    hours,
    kcal,
    consecutiveDays,
    daysSinceLastWorkout,
    acwr,
    tsb,
    pillarCounts,
    rolling4w: {
      metcon: rolling4wMetcon,
      strength: rolling4wStrength,
      aerobic: rolling4wAerobic,
      avgWeeklyKcal,
      floorHitRatePct,
    },
    advice,
  };
}
