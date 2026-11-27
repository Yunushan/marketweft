import { validIndicatorPeriod } from './market-core'

export const STUDIES = {
  rsi: { name: 'RSI', label: 'Relative Strength Index', minPeriod: 2, color: '#8eb3fa' },
  atr: { name: 'ATR', label: 'Average True Range', minPeriod: 1, color: '#e6ab66' },
} as const
export type StudyKind = keyof typeof STUDIES
export const STUDY_KINDS = Object.keys(STUDIES) as StudyKind[]
export type StudySettings = { enabled: boolean; period: number }
export const DEFAULT_STUDY_SETTINGS: StudySettings = { enabled: false, period: 14 }
export type StudySet = Partial<Record<StudyKind, StudySettings>>
export type StudyValues = { kind: StudyKind; period: number; series: (number | null)[] }

export function isStudyKind(key: string): key is StudyKind {
  return Object.hasOwn(STUDIES, key)
}
export function validStudyPeriod(kind: StudyKind, period: unknown): period is number {
  return validIndicatorPeriod(period) && period >= STUDIES[kind].minPeriod
}
