import { convertMovingTime2Sec, type Activity } from './utils';
import {
  getActivityCategory,
  getSportMeta,
  type TaxonomyMode,
} from './workoutTaxonomy';

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
 * Banister TRIMP (Training Impulse) estimate using moving duration + heart rate reserve.
 * Falls back to Strava suffer_score or calorie-scaled estimate when HR is missing.
 */
export function calculateTrimp(
  activity: Activity,
  hrRest = 55,
  hrMax = 192
): number {
  if (activity.suffer_score && activity.suffer_score > 0) {
    return Math.round(activity.suffer_score);
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
  hrMaxEstimate: number;
}

export function computeFitnessSeries(
  allActivities: Activity[],
  windowDays = 180
): FitnessSummary {
  if (!allActivities.length) {
    return { series: [], latest: null, hrMaxEstimate: 192 };
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
    return { series: [], latest: null, hrMaxEstimate: hrMax };
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

  return {
    series,
    latest: series.length ? series[series.length - 1] : null,
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

export interface WeekConsistencyItem {
  weekStart: string;
  count: number;
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
  targetSessions: number;
}

export function computeWeeklyConsistency(
  activities: Activity[],
  targetSessions = 3,
  maxWeeks = 52
): WeeklyConsistencySummary {
  if (!activities.length) {
    return {
      weeks: [],
      hitWeeks: 0,
      totalWeeks: 0,
      currentStreak: 0,
      bestStreak: 0,
      targetSessions,
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

  const map = new Map<string, { count: number; hours: number; kcal: number }>();
  for (
    let cur = new Date(startMon);
    cur <= lastMon;
    cur = new Date(cur.getTime() + 7 * 86400000)
  ) {
    map.set(cur.toISOString().slice(0, 10), { count: 0, hours: 0, kcal: 0 });
  }

  sorted.forEach((a) => {
    const k = getMondayIso(a.start_date_local);
    const entry = map.get(k);
    if (entry) {
      entry.count += 1;
      entry.hours += getActivityMinutes(a) / 60;
      entry.kcal += a.calories || 0;
    }
  });

  const weeks: WeekConsistencyItem[] = Array.from(map.entries()).map(
    ([weekStart, v]) => ({
      weekStart,
      count: v.count,
      hours: Number(v.hours.toFixed(1)),
      kcal: Math.round(v.kcal),
      status:
        v.count >= targetSessions
          ? 'hit'
          : v.count >= Math.max(1, targetSessions - 1)
            ? 'near'
            : 'rest',
    })
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
    targetSessions,
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
