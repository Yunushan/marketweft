import { validIndicatorPeriod } from './market-core'
import type { Bar, BollingerMeasures, CumulativeVolume, MarketCore, PriceBand } from './market-core'
import type { ExportOverlay } from './chart-export'

export const STUDIES = {
  rsi: { name: 'RSI', label: 'Relative Strength Index', minPeriod: 2, defaultPeriod: 14, color: '#8eb3fa' },
  atr: { name: 'ATR', label: 'Average True Range', minPeriod: 1, defaultPeriod: 14, color: '#e6ab66' },
  bb: { name: 'Bollinger Bands', label: 'Bollinger Bands', minPeriod: 1, defaultPeriod: 20 },
  bb_percent_b: { name: 'Bollinger %B', label: 'Bollinger %B', minPeriod: 1, defaultPeriod: 20, color: '#e797c7' },
  bb_bandwidth: { name: 'BandWidth', label: 'Bollinger BandWidth', minPeriod: 1, defaultPeriod: 20, color: '#6acec6' },
  donchian: { name: 'Donchian Channels', label: 'Donchian Channels', minPeriod: 1, defaultPeriod: 20 },
  keltner: { name: 'Keltner Channels', label: 'Keltner Channels', minPeriod: 1, defaultPeriod: 20, periodLabel: 'Keltner EMA' },
  stochastic: { name: 'Stochastic Oscillator', label: 'Stochastic Oscillator', minPeriod: 1, defaultPeriod: 14, periodLabel: 'Stochastic lookback', color: '#a6c9f8' },
  williams_r: { name: 'Williams %R', label: 'Williams %R', minPeriod: 1, defaultPeriod: 14, color: '#ceaeec' },
  macd: { name: 'MACD', label: 'Moving Average Convergence Divergence', minPeriod: 1, defaultPeriod: 12, periodLabel: 'MACD fast', color: '#9abdfd' },
  obv: { name: 'On-Balance Volume', label: 'On-Balance Volume', color: '#79c9b2' },
  adl: { name: 'Accumulation/Distribution Line', label: 'Accumulation/Distribution Line', color: '#e4ac7f' },
} as const
export type StudyKind = keyof typeof STUDIES
export const STUDY_KINDS = Object.keys(STUDIES) as StudyKind[]
export const EXTRA_STUDY_PERIODS = {
  atrPeriod: { label: 'Keltner ATR', defaultPeriod: 10 },
  smoothPeriod: { label: 'Stochastic %K smoothing', defaultPeriod: 3 },
  signalPeriod: { label: 'Stochastic %D', defaultPeriod: 3 },
  slowPeriod: { label: 'MACD slow', defaultPeriod: 26 },
  macdSignalPeriod: { label: 'MACD signal', defaultPeriod: 9 },
} as const
type ExtraStudyPeriod = keyof typeof EXTRA_STUDY_PERIODS
const EXTRA_PERIODS_BY_STUDY: Partial<Record<StudyKind, readonly ExtraStudyPeriod[]>> = {
  keltner: ['atrPeriod'],
  stochastic: ['smoothPeriod', 'signalPeriod'],
  macd: ['slowPeriod', 'macdSignalPeriod'],
}
export function extraStudyPeriods(kind: StudyKind): readonly ExtraStudyPeriod[] {
  return EXTRA_PERIODS_BY_STUDY[kind] ?? []
}
export type StudySettings = { enabled: boolean; period?: number } & Partial<Record<ExtraStudyPeriod, number>>
export function hasStudyPeriod(kind: StudyKind): boolean {
  return 'defaultPeriod' in STUDIES[kind]
}
export function defaultStudySettings(kind: StudyKind): StudySettings {
  const description = STUDIES[kind]
  const settings: StudySettings = { enabled: false }
  if ('defaultPeriod' in description) settings.period = description.defaultPeriod
  for (const key of extraStudyPeriods(kind)) settings[key] = EXTRA_STUDY_PERIODS[key].defaultPeriod
  return settings
}
export type StudySet = Partial<Record<StudyKind, StudySettings>>
export type StudyValue = number | bigint | null
type BandKind = 'bb' | 'donchian' | 'keltner'
export type PanelLine = {
  label?: string
  key?: string
  color: string
  series: StudyValue[]
  histogram?: { negativeColor: string }
}
export type PanelStudy = { kind: Exclude<StudyKind, BandKind>; periods: number[]; unit?: 'price' | 'volume'; lines: PanelLine[] }
export type BandStudy = {
  period: number
  bands: (PriceBand | null)[]
} & ({ kind: 'bb' | 'donchian' } | { kind: 'keltner'; atrPeriod: number })
export type StudyValues = PanelStudy | BandStudy
export const BAND_LINES = [
  { key: 'lower', label: 'Lower' },
  { key: 'middle', label: 'Middle' },
  { key: 'upper', label: 'Upper' },
] as const
export const BAND_STYLE = {
  bb: { name: 'BB', lower: '#8393e1', middle: '#bcb9f2', upper: '#8393e1' },
  donchian: { name: 'Donchian', lower: '#6fc290', middle: '#c0d481', upper: '#6fc290' },
  keltner: { name: 'Keltner', lower: '#d99970', middle: '#f4cba4', upper: '#d99970' },
} as const

export function isBandStudy(study: StudyValues): study is BandStudy {
  return 'bands' in study
}

export function computeStudies(core: MarketCore, settings: StudySet | undefined, bars: readonly Bar[]): StudyValues[] {
  const measuresByPeriod = new Map<number, BollingerMeasures[]>()
  let cumulative: CumulativeVolume[] | undefined
  return STUDY_KINDS.flatMap<StudyValues>(kind => {
    const study = settings?.[kind]
    if (!study?.enabled) return []
    if (kind === 'obv' || kind === 'adl') {
      cumulative ??= core.cumulativeVolume(bars)
      const key = kind === 'obv' ? 'onBalance' : 'accumulationDistribution'
      return [{ kind, periods: [], unit: 'volume', lines: [
        { color: STUDIES[kind].color, series: cumulative.map(row => row[key]) },
      ] }]
    }
    const { period = STUDIES[kind].defaultPeriod } = study
    if (kind === 'bb') return [{ kind, period, bands: core.bollingerBands(period, bars) }]
    if (kind === 'donchian') return [{ kind, period, bands: core.donchianChannels(period, bars) }]
    if (kind === 'keltner') {
      const atrPeriod = study.atrPeriod ?? EXTRA_STUDY_PERIODS.atrPeriod.defaultPeriod
      return [{ kind, period, atrPeriod, bands: core.keltnerChannels(period, atrPeriod, bars) }]
    }
    if (kind === 'stochastic') {
      const smooth = study.smoothPeriod ?? EXTRA_STUDY_PERIODS.smoothPeriod.defaultPeriod
      const signal = study.signalPeriod ?? EXTRA_STUDY_PERIODS.signalPeriod.defaultPeriod
      const rows = core.stochasticOscillator(period, smooth, signal, bars)
      return [{ kind, periods: [period, smooth, signal], lines: [
        { key: 'k', label: '%K', color: STUDIES.stochastic.color, series: rows.map(row => row.percentK) },
        { key: 'd', label: '%D', color: '#f1a98a', series: rows.map(row => row.percentD) },
      ] }]
    }
    if (kind === 'macd') {
      const slow = study.slowPeriod ?? EXTRA_STUDY_PERIODS.slowPeriod.defaultPeriod
      const signal = study.macdSignalPeriod ?? EXTRA_STUDY_PERIODS.macdSignalPeriod.defaultPeriod
      const rows = core.macd(period, slow, signal, bars)
      return [{ kind, periods: [period, slow, signal], unit: 'price', lines: [
        { key: 'line', label: 'Line', color: STUDIES.macd.color, series: rows.map(row => row.line) },
        { key: 'signal', label: 'Signal', color: '#f4c384', series: rows.map(row => row.signal) },
        { key: 'histogram', label: 'Histogram', color: '#458b77', series: rows.map(row => row.histogram),
          histogram: { negativeColor: '#a3687f' } },
      ] }]
    }
    let series: StudyValue[]
    if (kind === 'bb_percent_b' || kind === 'bb_bandwidth') {
      let measures = measuresByPeriod.get(period)
      if (!measures) {
        measures = core.bollingerMeasures(period, bars)
        measuresByPeriod.set(period, measures)
      }
      const key = kind === 'bb_percent_b' ? 'percentB' : 'bandwidth'
      series = measures.map(row => row[key])
    } else if (kind === 'williams_r') {
      series = core.williamsPercentR(period, bars)
    } else {
      series = core.indicator(kind, period, bars)
    }
    return [{ kind, periods: [period], ...(kind === 'atr' && { unit: 'price' }),
      lines: [{ color: STUDIES[kind].color, series }],
    }]
  })
}

export function studyOverlays(studies: StudyValues[]): ExportOverlay[] {
  return studies.flatMap<ExportOverlay>(study => isBandStudy(study) ?
    BAND_LINES.map(({ key }) => ({
      name: study.kind + '_' + key + '_' + study.period + (study.kind === 'keltner' ? '_' + study.atrPeriod : ''),
      series: study.bands.map(band => band?.[key] ?? null),
    })) :
    study.lines.map(line => ({
      name: [study.kind, ...(line.key ? [line.key] : []), ...study.periods].join('_'),
      series: line.series,
    })))
}

export function isStudyKind(key: string): key is StudyKind {
  return Object.hasOwn(STUDIES, key)
}
export function validStudyPeriodOrder(kind: StudyKind, settings: StudySettings): boolean {
  return kind !== 'macd' || (
    settings.period !== undefined && settings.slowPeriod !== undefined && settings.period < settings.slowPeriod
  )
}

export function validStudyPeriod(kind: StudyKind, period: unknown): period is number {
  const description = STUDIES[kind]
  return 'minPeriod' in description && validIndicatorPeriod(period) && period >= description.minPeriod
}
