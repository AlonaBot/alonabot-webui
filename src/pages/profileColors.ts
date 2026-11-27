export type ProfileColorName = 'teal' | 'navy' | 'amber' | 'pink' | 'green' | 'purple' | 'red' | 'gray';

export const PROFILE_COLORS: readonly ProfileColorName[] = [
  'teal',
  'navy',
  'amber',
  'pink',
  'green',
  'purple',
  'red',
  'gray',
];

export interface ProfileColorToken {
  readonly dot: string;
  readonly ring: string;
  readonly soft: string;
  readonly text: string;
}

const colorMap: Record<ProfileColorName, ProfileColorToken> = {
  teal: {
    dot: '#14B8A6',
    ring: 'rgba(20, 184, 166, 0.28)',
    soft: 'rgba(20, 184, 166, 0.14)',
    text: '#0F766E',
  },
  navy: {
    dot: '#3B82F6',
    ring: 'rgba(59, 130, 246, 0.28)',
    soft: 'rgba(59, 130, 246, 0.14)',
    text: '#1D4ED8',
  },
  amber: {
    dot: '#F59E0B',
    ring: 'rgba(245, 158, 11, 0.28)',
    soft: 'rgba(245, 158, 11, 0.14)',
    text: '#B45309',
  },
  pink: {
    dot: '#EC4899',
    ring: 'rgba(236, 72, 153, 0.28)',
    soft: 'rgba(236, 72, 153, 0.14)',
    text: '#BE185D',
  },
  green: {
    dot: '#10B981',
    ring: 'rgba(16, 185, 129, 0.28)',
    soft: 'rgba(16, 185, 129, 0.14)',
    text: '#047857',
  },
  purple: {
    dot: '#8B5CF6',
    ring: 'rgba(139, 92, 246, 0.28)',
    soft: 'rgba(139, 92, 246, 0.14)',
    text: '#6D28D9',
  },
  red: {
    dot: '#EF4444',
    ring: 'rgba(239, 68, 68, 0.28)',
    soft: 'rgba(239, 68, 68, 0.14)',
    text: '#B91C1C',
  },
  gray: {
    dot: '#64748B',
    ring: 'rgba(100, 116, 139, 0.28)',
    soft: 'rgba(100, 116, 139, 0.14)',
    text: '#475569',
  },
};

/** 返回配置文件颜色对应的点色、光晕和柔和背景色，未知值安全回退到 teal。 */
export function profileColorToken(color: string | undefined): ProfileColorToken {
  if (color && Object.hasOwn(colorMap, color)) {
    return colorMap[color as ProfileColorName];
  }
  return colorMap.teal;
}
