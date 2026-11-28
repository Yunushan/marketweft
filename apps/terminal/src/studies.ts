import { validIndicatorPeriod } from './market-core'
import type { AroonValue, Bar, BollingerMeasures, CumulativeVolume, MarketCore, PriceBand } from './market-core'
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
  chaikin_money_flow: { name: 'Chaikin Money Flow', label: 'Chaikin Money Flow', minPeriod: 1, defaultPeriod: 20, color: '#7ed2ca' },
  chaikin_oscillator: { name: 'Chaikin Oscillator', label: 'Chaikin Oscillator', minPeriod: 1, defaultPeriod: 3,
    periodLabel: 'Chaikin fast', color: '#d39ce1' },
  mfi: { name: 'MFI', label: 'Money Flow Index', minPeriod: 1, defaultPeriod: 14, color: '#a9cc89' },
  vwma: { name: 'VWMA', label: 'Volume-Weighted Moving Average', minPeriod: 1, defaultPeriod: 20, color: '#f1c177' },
  wma: { name: 'WMA', label: 'Weighted Moving Average', minPeriod: 1, defaultPeriod: 20, color: '#79a9ed' },
  dema: { name: 'DEMA', label: 'Double Exponential Moving Average', minPeriod: 1, defaultPeriod: 20, color: '#9bd5b1' },
  tema: { name: 'TEMA', label: 'Triple Exponential Moving Average', minPeriod: 1, defaultPeriod: 20, color: '#efac94' },
  hma: { name: 'HMA', label: 'Hull Moving Average', minPeriod: 1, defaultPeriod: 20, color: '#c0abf3' },
  dmi: { name: 'DMI', label: 'Directional Movement System', minPeriod: 1, defaultPeriod: 14, periodLabel: 'DI', color: '#aaa3f0' },
  cci: { name: 'CCI', label: 'Commodity Channel Index', minPeriod: 1, defaultPeriod: 20, color: '#c5adf1' },
  roc: { name: 'ROC', label: 'Rate of Change', minPeriod: 1, defaultPeriod: 12, color: '#73c3e4' },
  cmo: { name: 'CMO', label: 'Chande Momentum Oscillator', minPeriod: 2, defaultPeriod: 20, color: '#82c4e8' },
  trix: { name: 'TRIX', label: 'TRIX', minPeriod: 1, defaultPeriod: 30, color: '#dfba79' },
  aroon: { name: 'Aroon', label: 'Aroon', minPeriod: 1, defaultPeriod: 25 },
  aroon_oscillator: { name: 'Aroon Oscillator', label: 'Aroon Oscillator', minPeriod: 1, defaultPeriod: 25, color: '#98c9ef' },
} as const
export type StudyKind = keyof typeof STUDIES
export const STUDY_KINDS = Object.keys(STUDIES) as StudyKind[]
export const EXTRA_STUDY_PERIODS = {
  atrPeriod: { label: 'Keltner ATR', defaultPeriod: 10 },
  smoothPeriod: { label: 'Stochastic %K smoothing', defaultPeriod: 3 },
  signalPeriod: { label: 'Stochastic %D', defaultPeriod: 3 },
  slowPeriod: { label: 'MACD slow', defaultPeriod: 26 },
  macdSignalPeriod: { label: 'MACD signal', defaultPeriod: 9 },
  chaikinSlowPeriod: { label: 'Chaikin slow', defaultPeriod: 10 },
  adxPeriod: { label: 'ADX smoothing', defaultPeriod: 14 },
} as const
type ExtraStudyPeriod = keyof typeof EXTRA_STUDY_PERIODS
const EXTRA_PERIODS_BY_STUDY: Partial<Record<StudyKind, readonly ExtraStudyPeriod[]>> = {
  keltner: ['atrPeriod'],
  stochastic: ['smoothPeriod', 'signalPeriod'],
  macd: ['slowPeriod', 'macdSignalPeriod'],
  chaikin_oscillator: ['chaikinSlowPeriod'],
  dmi: ['adxPeriod'],
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
const PRICE_AVERAGES = {
  vwma: 'volumeWeightedAverage',
  wma: 'linearlyWeightedAverage',
  dema: 'doubleExponentialMovingAverage',
  tema: 'tripleExponentialMovingAverage',
  hma: 'hullMovingAverage',
} as const
type PriceAverageKind = keyof typeof PRICE_AVERAGES
function isPriceAverage(kind: StudyKind): kind is PriceAverageKind {
  return Object.hasOwn(PRICE_AVERAGES, kind)
}
type StudyLine<Value> = {
  label?: string
  key?: string
  color: string
  series: Value[]
}
export type PanelLine = StudyLine<StudyValue> & { histogram?: { negativeColor: string } }
export type PanelStudy = {
  kind: Exclude<StudyKind, BandKind | PriceAverageKind>
  periods: number[]
  unit?: 'price' | 'volume' | 'index'
  guides?: number[]
  zeroLine?: boolean
  lines: PanelLine[]
}
export type PriceStudy = {
  kind: BandKind | PriceAverageKind
  periods: number[]
  heading: string
  priceOverlay: true
  lines: StudyLine<bigint | null>[]
}
export type StudyValues = PanelStudy | PriceStudy
const BAND_LINES = [
  { key: 'lower', label: 'Lower' },
  { key: 'middle', label: 'Middle' },
  { key: 'upper', label: 'Upper' },
] as const
const BAND_STYLE = {
  bb: { name: 'BB', lower: '#8393e1', middle: '#bcb9f2', upper: '#8393e1' },
  donchian: { name: 'Donchian', lower: '#6fc290', middle: '#c0d481', upper: '#6fc290' },
  keltner: { name: 'Keltner', lower: '#d99970', middle: '#f4cba4', upper: '#d99970' },
} as const

export function isPriceStudy(study: StudyValues): study is PriceStudy {
  return 'priceOverlay' in study
}

function priceBands(kind: BandKind, periods: number[], bands: (PriceBand | null)[]): PriceStudy {
  return {
    kind, periods, heading: BAND_STYLE[kind].name, priceOverlay: true,
    lines: BAND_LINES.map(({ key, label }) => ({
      key, label, color: BAND_STYLE[kind][key], series: bands.map(band => band?.[key] ?? null),
    })),
  }
}

export function computeStudies(core: MarketCore, settings: StudySet | undefined, bars: readonly Bar[]): StudyValues[] {
  const measuresByPeriod = new Map<number, BollingerMeasures[]>()
  const aroonByPeriod = new Map<number, (AroonValue | null)[]>()
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
    if (kind === 'bb') return [priceBands(kind, [period], core.bollingerBands(period, bars))]
    if (kind === 'donchian') return [priceBands(kind, [period], core.donchianChannels(period, bars))]
    if (kind === 'keltner') {
      const atrPeriod = study.atrPeriod ?? EXTRA_STUDY_PERIODS.atrPeriod.defaultPeriod
      return [priceBands(kind, [period, atrPeriod], core.keltnerChannels(period, atrPeriod, bars))]
    }
    if (isPriceAverage(kind)) {
      return [{ kind, periods: [period], heading: STUDIES[kind].name, priceOverlay: true,
        lines: [{ color: STUDIES[kind].color, series: core[PRICE_AVERAGES[kind]](period, bars) }],
      }]
    }
    if (kind === 'dmi') {
      const adx = study.adxPeriod ?? EXTRA_STUDY_PERIODS.adxPeriod.defaultPeriod
      const rows = core.directionalMovement(period, adx, bars)
      return [{ kind, periods: [period, adx], lines: [
        { key: 'plus_di', label: '+DI', color: '#6ecb99', series: rows.map(row => row.plusDi) },
        { key: 'minus_di', label: '−DI', color: '#e68a88', series: rows.map(row => row.minusDi) },
        { key: 'adx', label: 'ADX', color: STUDIES.dmi.color, series: rows.map(row => row.adx) },
      ] }]
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
      return [{ kind, periods: [period, slow, signal], unit: 'price', zeroLine: true, lines: [
        { key: 'line', label: 'Line', color: STUDIES.macd.color, series: rows.map(row => row.line) },
        { key: 'signal', label: 'Signal', color: '#f4c384', series: rows.map(row => row.signal) },
        { key: 'histogram', label: 'Histogram', color: '#458b77', series: rows.map(row => row.histogram),
          histogram: { negativeColor: '#a3687f' } },
      ] }]
    }
    if (kind === 'chaikin_oscillator') {
      const slow = study.chaikinSlowPeriod ?? EXTRA_STUDY_PERIODS.chaikinSlowPeriod.defaultPeriod
      return [{ kind, periods: [period, slow], unit: 'volume', zeroLine: true, lines: [
        { color: STUDIES[kind].color, series: core.chaikinOscillator(period, slow, bars) },
      ] }]
    }
    if (kind === 'chaikin_money_flow') {
      return [{ kind, periods: [period], zeroLine: true, lines: [
        { color: STUDIES[kind].color, series: core.chaikinMoneyFlow(period, bars) },
      ] }]
    }
    if (kind === 'aroon' || kind === 'aroon_oscillator') {
      let rows = aroonByPeriod.get(period)
      if (!rows) {
        rows = core.aroon(period, bars)
        aroonByPeriod.set(period, rows)
      }
      const lines = kind === 'aroon' ? [
        { key: 'up', label: 'Up', color: '#87cb8d', series: rows.map(row => row?.up ?? null) },
        { key: 'down', label: 'Down', color: '#e39386', series: rows.map(row => row?.down ?? null) },
      ] : [
        { color: STUDIES.aroon_oscillator.color, series: rows.map(row => row?.oscillator ?? null) },
      ]
      return [{ kind, periods: [period], lines }]
    }
    if (kind === 'cci') {
      return [{ kind, periods: [period], unit: 'index', guides: [-100, 0, 100], lines: [
        { color: STUDIES.cci.color, series: core.commodityChannelIndex(period, bars) },
      ] }]
    }
    if (kind === 'roc') {
      return [{ kind, periods: [period], zeroLine: true, lines: [
        { color: STUDIES.roc.color, series: core.rateOfChange(period, bars) },
      ] }]
    }
    if (kind === 'cmo' || kind === 'trix') {
      const series = kind === 'cmo' ? core.chandeMomentumOscillator(period, bars) : core.trix(period, bars)
      return [{ kind, periods: [period], zeroLine: true, lines: [{ color: STUDIES[kind].color, series }] }]
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
    } else if (kind === 'mfi') {
      series = core.moneyFlowIndex(period, bars)
    } else {
      series = core.indicator(kind, period, bars)
    }
    return [{ kind, periods: [period], ...(kind === 'atr' && { unit: 'price' }),
      lines: [{ color: STUDIES[kind].color, series }],
    }]
  })
}

export function studyOverlays(studies: StudyValues[]): ExportOverlay[] {
  return studies.flatMap<ExportOverlay>(study => study.lines.map(line => ({
      name: [study.kind, ...(line.key ? [line.key] : []), ...study.periods].join('_'),
      series: line.series,
    })))
}

export function isStudyKind(key: string): key is StudyKind {
  return Object.hasOwn(STUDIES, key)
}
export function validStudyPeriodOrder(kind: StudyKind, settings: StudySettings): boolean {
  if (kind !== 'macd' && kind !== 'chaikin_oscillator') return true
  const slow = kind === 'macd' ? settings.slowPeriod : settings.chaikinSlowPeriod
  return settings.period !== undefined && slow !== undefined && settings.period < slow
}

export function validStudyPeriod(kind: StudyKind, period: unknown): period is number {
  const description = STUDIES[kind]
  return 'minPeriod' in description && validIndicatorPeriod(period) && period >= description.minPeriod
}
