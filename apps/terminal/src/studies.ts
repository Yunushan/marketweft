import { validIndicatorPeriod } from './market-core'
import type { Bar, BollingerBand, BollingerMeasures, MarketCore } from './market-core'
import type { ExportOverlay } from './chart-export'

export const STUDIES = {
  rsi: { name: 'RSI', label: 'Relative Strength Index', minPeriod: 2, defaultPeriod: 14, color: '#8eb3fa' },
  atr: { name: 'ATR', label: 'Average True Range', minPeriod: 1, defaultPeriod: 14, color: '#e6ab66' },
  bb: { name: 'Bollinger Bands', label: 'Bollinger Bands', minPeriod: 1, defaultPeriod: 20 },
  bb_percent_b: { name: 'Bollinger %B', label: 'Bollinger %B', minPeriod: 1, defaultPeriod: 20, color: '#e797c7' },
  bb_bandwidth: { name: 'BandWidth', label: 'Bollinger BandWidth', minPeriod: 1, defaultPeriod: 20, color: '#6acec6' },
} as const
export type StudyKind = keyof typeof STUDIES
export const STUDY_KINDS = Object.keys(STUDIES) as StudyKind[]
export type StudySettings = { enabled: boolean; period: number }
export function defaultStudySettings(kind: StudyKind): StudySettings {
  return { enabled: false, period: STUDIES[kind].defaultPeriod }
}
export type StudySet = Partial<Record<StudyKind, StudySettings>>
export type StudyValue = number | bigint | null
export type PanelStudy = { kind: Exclude<StudyKind, 'bb'>; period: number; series: StudyValue[] }
type BandStudy = { kind: 'bb'; period: number; bands: (BollingerBand | null)[] }
export type StudyValues = PanelStudy | BandStudy
export const BAND_LINES = [
  { key: 'lower', label: 'Lower', color: '#8393e1' },
  { key: 'middle', label: 'Middle', color: '#bcb9f2' },
  { key: 'upper', label: 'Upper', color: '#8393e1' },
] as const

export function computeStudies(core: MarketCore, settings: StudySet | undefined, bars: readonly Bar[]): StudyValues[] {
  const measuresByPeriod = new Map<number, BollingerMeasures[]>()
  return STUDY_KINDS.flatMap<StudyValues>(kind => {
    const study = settings?.[kind]
    if (!study?.enabled) return []
    const { period } = study
    if (kind === 'bb') return [{ kind, period, bands: core.bollingerBands(period, bars) }]
    if (kind === 'bb_percent_b' || kind === 'bb_bandwidth') {
      let measures = measuresByPeriod.get(period)
      if (!measures) {
        measures = core.bollingerMeasures(period, bars)
        measuresByPeriod.set(period, measures)
      }
      const key = kind === 'bb_percent_b' ? 'percentB' : 'bandwidth'
      return [{ kind, period, series: measures.map(row => row[key]) }]
    }
    return [{ kind, period, series: core.indicator(kind, period, bars) }]
  })
}

export function studyOverlays(studies: StudyValues[]): ExportOverlay[] {
  return studies.flatMap<ExportOverlay>(study => study.kind === 'bb' ?
    BAND_LINES.map(({ key }) => ({
      name: 'bb_' + key + '_' + study.period,
      series: study.bands.map(band => band?.[key] ?? null),
    })) :
    [{ name: study.kind + '_' + study.period, series: study.series }])
}

export function isStudyKind(key: string): key is StudyKind {
  return Object.hasOwn(STUDIES, key)
}
export function validStudyPeriod(kind: StudyKind, period: unknown): period is number {
  return validIndicatorPeriod(period) && period >= STUDIES[kind].minPeriod
}
