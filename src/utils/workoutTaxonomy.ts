import type { Activity } from './utils';

export type TaxonomyMode = 'sub' | 'raw';

export interface SportMeta {
  key: string;
  label: string;
  shortLabel: string;
  color: string;
  indoor: boolean;
}

export const SPORT_META: Record<string, SportMeta> = {
  CrossFit: {
    key: 'CrossFit',
    label: 'CrossFit',
    shortLabel: 'CrossFit',
    color: '#10b981',
    indoor: true,
  },
  Badminton: {
    key: 'Badminton',
    label: 'Badminton 羽毛球',
    shortLabel: 'Badminton',
    color: '#38bdf8',
    indoor: true,
  },
  Swim: {
    key: 'Swim',
    label: 'Swim 游泳',
    shortLabel: 'Swim',
    color: '#06b6d4',
    indoor: true,
  },
  Strength: {
    key: 'Strength',
    label: 'Strength 力量',
    shortLabel: 'Strength',
    color: '#a855f7',
    indoor: true,
  },
  HIIT: {
    key: 'HIIT',
    label: 'HIIT',
    shortLabel: 'HIIT',
    color: '#f43f5e',
    indoor: true,
  },
  Hyrox: {
    key: 'Hyrox',
    label: 'Hyrox',
    shortLabel: 'Hyrox',
    color: '#f97316',
    indoor: true,
  },
  'Other Workout': {
    key: 'Other Workout',
    label: 'Other Workout',
    shortLabel: 'Other',
    color: '#94a3b8',
    indoor: true,
  },
  Workout: {
    key: 'Workout',
    label: 'Workout',
    shortLabel: 'Workout',
    color: '#10b981',
    indoor: true,
  },
  Hike: {
    key: 'Hike',
    label: 'Hike 徒步',
    shortLabel: 'Hike',
    color: '#84cc16',
    indoor: false,
  },
  Run: {
    key: 'Run',
    label: 'Run 跑步',
    shortLabel: 'Run',
    color: '#eab308',
    indoor: false,
  },
  'Trail Run': {
    key: 'Trail Run',
    label: 'Trail Run 越野',
    shortLabel: 'Trail Run',
    color: '#f59e0b',
    indoor: false,
  },
  Ride: {
    key: 'Ride',
    label: 'Ride 骑行',
    shortLabel: 'Ride',
    color: '#6366f1',
    indoor: false,
  },
  Ski: {
    key: 'Ski',
    label: 'Ski 滑雪',
    shortLabel: 'Ski',
    color: '#60a5fa',
    indoor: false,
  },
  Rowing: {
    key: 'Rowing',
    label: 'Rowing 划船',
    shortLabel: 'Rowing',
    color: '#14b8a6',
    indoor: true,
  },
};

const SUBTYPE_MAP: Record<string, string> = {
  crossfit: 'CrossFit',
  weighttraining: 'Strength',
  highintensityintervaltraining: 'HIIT',
  badminton: 'Badminton',
  hybridracing: 'Hyrox',
  hybridrace: 'Hyrox',
  hyrox: 'Hyrox',
};

export function classifySubSport(activity: Activity): string {
  const rawSubtype = (activity.subtype || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (rawSubtype && SUBTYPE_MAP[rawSubtype]) {
    // Allow title keyword 'hyrox' to override generic Crossfit/Workout when present
    const lowerTitle = (activity.name || '').toLowerCase();
    if (lowerTitle.includes('hyrox')) return 'Hyrox';
    return SUBTYPE_MAP[rawSubtype];
  }

  const rawType = (activity.type || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (rawType && SUBTYPE_MAP[rawType]) {
    return SUBTYPE_MAP[rawType];
  }

  if (activity.type !== 'Workout') {
    return activity.type;
  }

  const name = activity.name || '';
  const lowerName = name.toLowerCase();

  // Title keywords catch Hyrox / Hybrid Racing / CrossFit / Badminton when Strava sends generic Workout
  if (lowerName.includes('hyrox') || lowerName.includes('hybrid')) {
    return 'Hyrox';
  }
  if (lowerName.includes('crossfit')) return 'CrossFit';
  if (lowerName.includes('badminton') || name.includes('羽毛球')) {
    return 'Badminton';
  }
  if (lowerName.includes('hiit') || name.includes('高强度间歇')) {
    return 'HIIT';
  }
  if (
    lowerName.includes('weight') ||
    lowerName.includes('fitbod') ||
    name.includes('重量') ||
    name.includes('力量')
  ) {
    return 'Strength';
  }

  return 'Other Workout';
}

export function getActivityCategory(
  activity: Activity,
  mode: TaxonomyMode = 'sub'
): string {
  return mode === 'sub' ? classifySubSport(activity) : activity.type;
}

export function getSportMeta(category: string): SportMeta {
  return (
    SPORT_META[category] ?? {
      key: category,
      label: category,
      shortLabel: category,
      color: '#94a3b8',
      indoor: true,
    }
  );
}

export function isOutdoorSport(category: string): boolean {
  return !getSportMeta(category).indoor;
}

export function matchesCategoryFilter(
  activity: Activity,
  category: string,
  mode: TaxonomyMode = 'sub'
): boolean {
  if (getActivityCategory(activity, mode) === category) return true;
  if (mode === 'sub' && activity.type === category) return true;
  return false;
}
