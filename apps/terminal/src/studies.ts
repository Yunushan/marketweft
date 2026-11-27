import { validIndicatorPeriod } from './market-core'
import type { Bar, BollingerMeasures, MarketCore, PriceBand } from './market-core'
import type { ExportOverlay } from './chart-export'

export const STUDIES = {
  rsi: { name: 'RSI', label: 'Relative Strength Index', minPeriod: 2, defaultPeriod: 14, color: '#8eb3fa' },
  atr: { name: 'ATR', label: 'Average True Range', minPeriod: 1, defaultPeriod: 14, color: '#e6ab66' },
  bb: { name: 'Bollinger Bands', label: 'Bollinger Bands', minPeriod: 1, defaultPeriod: 20 },
  bb_percent_b: { name: 'Bollinger %B', label: 'Bollinger %B', minPeriod: 1, defaultPeriod: 20, color: '#e797c7' },
  bb_bandwidth: { name: 'BandWidth', label: 'Bollinger BandWidth', minPeriod: 1, defaultPeriod: 20, color: '#6acec6' },
  donchian: { name: 'Donchian Channels', label: 'Donchian Channels', minPeriod: 1, defaultPeriod: 20 },
} as const
export type StudyKind = keyof typeof STUDIES
export const STUDY_KINDS = Object.keys(STUDIES) as StudyKind[]
export type StudySettings = { enabled: boolean; period: number }
export function defaultStudySettings(kind: StudyKind): StudySettings {
  return { enabled: false, period: STUDIES[kind].defaultPeriod }
}
export type StudySet = Partial<Record<StudyKind, StudySettings>>
export type StudyValue = number | bigint | null
type BandKind = 'bb' | 'donchian'
export type PanelStudy = { kind: Exclude<StudyKind, BandKind>; period: number; series: StudyValue[] }
export type BandStudy = { kind: BandKind; period: number; bands: (PriceBand | null)[] }
export type StudyValues = PanelStudy | BandStudy
export const BAND_LINES = [
  { key: 'lower', label: 'Lower' },
  { key: 'middle', label: 'Middle' },
  { key: 'upper', label: 'Upper' },
] as const
export const BAND_STYLE = {
  bb: { name: 'BB', lower: '#8393e1', middle: '#bcb9f2', upper: '#8393e1' },
  donchian: { name: 'Donchian', lower: '#6fc290', middle: '#c0d481', upper: '#6fc290' },
} as const

export function isBandStudy(study: StudyValues): study is BandStudy {
  return 'bands' in study
}

export function computeStudies(core: MarketCore, settings: StudySet | undefined, bars: readonly Bar[]): StudyValues[] {
  const measuresByPeriod = new Map<number, BollingerMeasures[]>()
  return STUDY_KINDS.flatMap<StudyValues>(kind => {
    const study = settings?.[kind]
    if (!study?.enabled) return []
    const { period } = study
    if (kind === 'bb') return [{ kind, period, bands: core.bollingerBands(period, bars) }]
    if (kind === 'donchian') return [{ kind, period, bands: core.donchianChannels(period, bars) }]
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
  return studies.flatMap<ExportOverlay>(study => isBandStudy(study) ?
    BAND_LINES.map(({ key }) => ({
      name: study.kind + '_' + key + '_' + study.period,
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
