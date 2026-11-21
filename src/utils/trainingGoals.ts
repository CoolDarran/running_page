import type { Activity } from './utils';
import { classifySubSport } from './workoutTaxonomy';

/**
 * Personal weekly targets tailored to:
 * 1) CrossFit performance
 * 2) Fat loss & body recomposition (减脂塑形)
 * 3) Long-term consistency without burnout (长期规律)
 */
export const TRAINING_GOALS = {
  weeklyFloorDays: 3, // 保底出勤天数
  weeklyTargetDays: 4, // 理想出勤天数
  weeklyTargetKcal: 2000, // 减脂周主动消耗目标 (kcal)
  weeklyTargetHours: 4.0, // 周训练时长参考线 (h)
  consecutiveDayWarn: 5, // 连续训练预警阈值 (天)
  rolling4wMinStrength: 4, // 近 4 周保肌力量目标 (1次/周)
  rolling4wMinAerobic: 4, // 近 4 周稳态/恢复有氧目标 (1次/周)
} as const;

export type TrainingPillar = 'metcon' | 'strength' | 'aerobic';

export const PILLAR_META: Record<
  TrainingPillar,
  { label: string; shortLabel: string; color: string; examples: string }
> = {
  metcon: {
    label: '高强度代谢',
    shortLabel: '代谢',
    color: '#10b981',
    examples: 'CrossFit / Hyrox / HIIT',
  },
  strength: {
    label: '专项力量',
    shortLabel: '力量',
    color: '#a855f7',
    examples: '重量训练 / 肌肥大保肌',
  },
  aerobic: {
    label: '有氧与恢复',
    shortLabel: '有氧',
    color: '#38bdf8',
    examples: '徒步 / 游泳 / 羽球 / 跑骑',
  },
};

export function classifyTrainingPillar(activity: Activity): TrainingPillar {
  const sub = classifySubSport(activity);
  if (sub === 'CrossFit' || sub === 'Hyrox' || sub === 'HIIT') {
    return 'metcon';
  }
  if (sub === 'Strength') {
    return 'strength';
  }
  if (sub === 'Other Workout') {
    return (activity.average_heartrate || 0) >= 132 ? 'metcon' : 'aerobic';
  }
  return 'aerobic';
}
