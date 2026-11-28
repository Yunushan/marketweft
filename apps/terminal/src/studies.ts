import { validIndicatorPeriod } from './market-core'
import type { AroonValue, Bar, BollingerMeasures, CumulativeVolume, FloorPivotLevels, MarketCore, PriceBand } from './market-core'
import type { ExportOverlay } from './chart-export'

export const STUDIES = {
  rsi: { name: 'RSI', label: 'Relative Strength Index', minPeriod: 2, defaultPeriod: 14, color: '#8eb3fa' },
  atr: { name: 'ATR', label: 'Average True Range', minPeriod: 1, defaultPeriod: 14, color: '#e6ab66' },
  natr: { name: 'Normalized ATR', label: 'Normalized Average True Range', minPeriod: 1, defaultPeriod: 14, color: '#bdb1ef' },
  bb: { name: 'Bollinger Bands', label: 'Bollinger Bands', minPeriod: 1, defaultPeriod: 20 },
  bb_percent_b: { name: 'Bollinger %B', label: 'Bollinger %B', minPeriod: 1, defaultPeriod: 20, color: '#e797c7' },
  bb_bandwidth: { name: 'BandWidth', label: 'Bollinger BandWidth', minPeriod: 1, defaultPeriod: 20, color: '#6acec6' },
  donchian: { name: 'Donchian Channels', label: 'Donchian Channels', minPeriod: 1, defaultPeriod: 20 },
  keltner: { name: 'Keltner Channels', label: 'Keltner Channels', minPeriod: 1, defaultPeriod: 20, periodLabel: 'Keltner EMA' },
  stochastic: { name: 'Stochastic Oscillator', label: 'Stochastic Oscillator', minPeriod: 1, defaultPeriod: 14, periodLabel: 'Stochastic lookback', color: '#a6c9f8' },
  stochastic_rsi: { name: 'Stochastic RSI', label: 'Stochastic RSI', minPeriod: 2, defaultPeriod: 14, periodLabel: 'Stochastic RSI Wilder RSI', color: '#aca8f2' },
  ultimate: { name: 'Ultimate Oscillator', label: 'Ultimate Oscillator', minPeriod: 1, defaultPeriod: 7, periodLabel: 'Ultimate Oscillator short', color: '#79cdb5' },
  williams_r: { name: 'Williams %R', label: 'Williams %R', minPeriod: 1, defaultPeriod: 14, color: '#ceaeec' },
  macd: { name: 'MACD', label: 'Moving Average Convergence Divergence', minPeriod: 1, defaultPeriod: 12, periodLabel: 'MACD fast', color: '#9abdfd' },
  ppo: { name: 'PPO', label: 'Percentage Price Oscillator', minPeriod: 1, defaultPeriod: 12, periodLabel: 'PPO fast', color: '#a1e4c5' },
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
  kama: { name: 'KAMA', label: 'Kaufman Adaptive Moving Average', minPeriod: 1, defaultPeriod: 10, color: '#e2b764' },
  kaufman_efficiency: { name: 'Kaufman Efficiency Ratio', label: 'Kaufman Efficiency Ratio',
    minPeriod: 1, defaultPeriod: 10, color: '#81d2c0' },
  dmi: { name: 'DMI', label: 'Directional Movement System', minPeriod: 1, defaultPeriod: 14, periodLabel: 'DI', color: '#aaa3f0' },
  cci: { name: 'CCI', label: 'Commodity Channel Index', minPeriod: 1, defaultPeriod: 20, color: '#c5adf1' },
  roc: { name: 'ROC', label: 'Rate of Change', minPeriod: 1, defaultPeriod: 12, color: '#73c3e4' },
  coppock: { name: 'Coppock Curve', label: 'Coppock Curve', minPeriod: 1, defaultPeriod: 10,
    periodLabel: 'Coppock smoothing', color: '#e8b185' },
  cmo: { name: 'CMO', label: 'Chande Momentum Oscillator', minPeriod: 2, defaultPeriod: 20, color: '#82c4e8' },
  trix: { name: 'TRIX', label: 'TRIX', minPeriod: 1, defaultPeriod: 30, color: '#dfba79' },
  vortex: { name: 'Vortex', label: 'Vortex Indicator', minPeriod: 1, defaultPeriod: 14 },
  bop: { name: 'Balance of Power', label: 'Balance of Power', color: '#b5a2e5' },
  daily_pivots: { name: 'Daily Floor Pivots', label: 'Daily Floor Pivots' },
  elder_force: { name: 'Elder Force Index', label: 'Elder Force Index', minPeriod: 1, defaultPeriod: 13, color: '#e5b57f' },
  elder_ray: { name: 'Elder-Ray Index', label: 'Elder-Ray Index', minPeriod: 1, defaultPeriod: 13 },
  demarker: { name: 'DeMarker', label: 'DeMarker', minPeriod: 1, defaultPeriod: 14, color: '#87cbe0' },
  relative_vigor: { name: 'Relative Vigor Index', label: 'Relative Vigor Index', minPeriod: 1, defaultPeriod: 10, color: '#88d6b5' },
  chaikin_volatility: { name: 'Chaikin Volatility', label: 'Chaikin Volatility', minPeriod: 1, defaultPeriod: 10,
    periodLabel: 'Chaikin Volatility smoothing', color: '#a2cee5' },
  aroon: { name: 'Aroon', label: 'Aroon', minPeriod: 1, defaultPeriod: 25 },
  aroon_oscillator: { name: 'Aroon Oscillator', label: 'Aroon Oscillator', minPeriod: 1, defaultPeriod: 25, color: '#98c9ef' },
} as const
export type StudyKind = keyof typeof STUDIES
export const STUDY_KINDS = Object.keys(STUDIES) as StudyKind[]
export const EXTRA_STUDY_PERIODS = {
  atrPeriod: { label: 'Keltner ATR', defaultPeriod: 10 },
  smoothPeriod: { label: 'Stochastic %K smoothing', defaultPeriod: 3 },
  signalPeriod: { label: 'Stochastic %D', defaultPeriod: 3 },
  stochRsiLookback: { label: 'Stochastic RSI lookback', defaultPeriod: 14 },
  stochRsiSmoothing: { label: 'Stochastic RSI %K smoothing', defaultPeriod: 3 },
  stochRsiSignal: { label: 'Stochastic RSI %D', defaultPeriod: 3 },
  ultimateMiddlePeriod: { label: 'Ultimate Oscillator medium', defaultPeriod: 14 },
  ultimateLongPeriod: { label: 'Ultimate Oscillator long', defaultPeriod: 28 },
  slowPeriod: { label: 'MACD slow', defaultPeriod: 26 },
  macdSignalPeriod: { label: 'MACD signal', defaultPeriod: 9 },
  ppoSlowPeriod: { label: 'PPO slow', defaultPeriod: 26 },
  ppoSignalPeriod: { label: 'PPO signal', defaultPeriod: 9 },
  chaikinSlowPeriod: { label: 'Chaikin slow', defaultPeriod: 10 },
  volatilityLookback: { label: 'Chaikin Volatility comparison', defaultPeriod: 10 },
  coppockFirstPeriod: { label: 'Coppock first change', defaultPeriod: 11 },
  coppockSecondPeriod: { label: 'Coppock second change', defaultPeriod: 14 },
  adxPeriod: { label: 'ADX smoothing', defaultPeriod: 14 },
} as const
type ExtraStudyPeriod = keyof typeof EXTRA_STUDY_PERIODS
const EXTRA_PERIODS_BY_STUDY: Partial<Record<StudyKind, readonly ExtraStudyPeriod[]>> = {
  keltner: ['atrPeriod'],
  stochastic: ['smoothPeriod', 'signalPeriod'],
  stochastic_rsi: ['stochRsiLookback', 'stochRsiSmoothing', 'stochRsiSignal'],
  ultimate: ['ultimateMiddlePeriod', 'ultimateLongPeriod'],
  macd: ['slowPeriod', 'macdSignalPeriod'],
  ppo: ['ppoSlowPeriod', 'ppoSignalPeriod'],
  chaikin_oscillator: ['chaikinSlowPeriod'],
  chaikin_volatility: ['volatilityLookback'],
  coppock: ['coppockFirstPeriod', 'coppockSecondPeriod'],
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
  kama: 'kaufmanAdaptiveMovingAverage',
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
  stepped?: boolean
}
export type PanelLine = StudyLine<StudyValue> & { histogram?: { negativeColor: string } }
export type PanelStudy = {
  kind: Exclude<StudyKind, BandKind | PriceAverageKind | 'daily_pivots'>
  periods: number[]
  unit?: 'price' | 'volume' | 'index'
  guides?: number[]
  zeroLine?: boolean
  lines: PanelLine[]
}
export type PriceStudy = {
  kind: BandKind | PriceAverageKind | 'daily_pivots'
  periods: number[]
  heading: string
  priceOverlay: true
  lines: StudyLine<bigint | null>[]
  sourceAt?: (number | null)[]
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

const PIVOT_LINES: readonly { field: Exclude<keyof FloorPivotLevels, 'priorCloseAt'>; key: string; label: string; color: string }[] = [
  { field: 'pivot', key: 'pivot', label: 'P', color: '#e6bb76' },
  { field: 'supportOne', key: 'support_1', label: 'S1', color: '#7dbaa9' },
  { field: 'supportTwo', key: 'support_2', label: 'S2', color: '#56a08b' },
  { field: 'resistanceOne', key: 'resistance_1', label: 'R1', color: '#d7909f' },
  { field: 'resistanceTwo', key: 'resistance_2', label: 'R2', color: '#b9778d' },
]

export function computeStudies(core: MarketCore, settings: StudySet | undefined, bars: readonly Bar[], sourceBars = bars): StudyValues[] {
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
    if (kind === 'bop') return [{ kind, periods: [], unit: 'index', lines: [
      { color: STUDIES.bop.color, series: core.balanceOfPower(bars) },
    ] }]
    if (kind === 'daily_pivots') {
      const levels = core.dailyFloorPivots(sourceBars, bars.map(bar => bar.time))
      return [{ kind, periods: [], heading: STUDIES[kind].name, priceOverlay: true,
        sourceAt: levels.map(level => level?.priorCloseAt ?? null),
        lines: PIVOT_LINES.map(({ field, key, label, color }) => ({ key, label, color, stepped: true,
          series: levels.map(level => level?.[field] ?? null) })),
      }]
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
    if (kind === 'vortex') {
      const rows = core.vortexIndicator(period, bars)
      return [{ kind, periods: [period], unit: 'index', guides: [1], lines: [
        { key: 'positive', label: 'VI+', color: '#83ceae', series: rows.map(row => row?.positive ?? null) },
        { key: 'negative', label: 'VI−', color: '#eaa1a2', series: rows.map(row => row?.negative ?? null) },
      ] }]
    }
    if (kind === 'stochastic' || kind === 'stochastic_rsi') {
      const periods = [period, ...extraStudyPeriods(kind).map(key => study[key] ?? EXTRA_STUDY_PERIODS[key].defaultPeriod)]
      const rows = kind === 'stochastic'
        ? core.stochasticOscillator(period, periods[1], periods[2], bars)
        : core.stochasticRsi(period, periods[1], periods[2], periods[3], bars)
      return [{ kind, periods, lines: [
        { key: 'k', label: '%K', color: STUDIES[kind].color, series: rows.map(row => row.percentK) },
        { key: 'd', label: '%D', color: '#f1a98a', series: rows.map(row => row.percentD) },
      ] }]
    }
    if (kind === 'ultimate') {
      const medium = study.ultimateMiddlePeriod ?? EXTRA_STUDY_PERIODS.ultimateMiddlePeriod.defaultPeriod
      const long = study.ultimateLongPeriod ?? EXTRA_STUDY_PERIODS.ultimateLongPeriod.defaultPeriod
      return [{ kind, periods: [period, medium, long], lines: [
        { color: STUDIES[kind].color, series: core.ultimateOscillator(period, medium, long, bars) },
      ] }]
    }
    if (kind === 'macd' || kind === 'ppo') {
      const [slow, signal] = extraStudyPeriods(kind).map(key => study[key] ?? EXTRA_STUDY_PERIODS[key].defaultPeriod)
      const rows = kind === 'macd' ? core.macd(period, slow, signal, bars) : core.percentagePriceOscillator(period, slow, signal, bars)
      return [{ kind, periods: [period, slow, signal], unit: kind === 'macd' ? 'price' : undefined, zeroLine: true, lines: [
        { key: 'line', label: 'Line', color: STUDIES[kind].color, series: rows.map(row => row.line) },
        { key: 'signal', label: 'Signal', color: '#f4c384', series: rows.map(row => row.signal) },
        { key: 'histogram', label: 'Histogram', color: '#458b77', series: rows.map(row => row.histogram),
          histogram: { negativeColor: '#a3687f' } },
      ] }]
    }
    if (kind === 'natr') return [{ kind, periods: [period], zeroLine: true, lines: [
      { color: STUDIES[kind].color, series: core.normalizedAverageTrueRange(period, bars) },
    ] }]
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
    if (kind === 'elder_force') return [{ kind, periods: [period], unit: 'index', zeroLine: true, lines: [
      { color: STUDIES[kind].color, series: core.elderForceIndex(period, bars) },
    ] }]
    if (kind === 'elder_ray') {
      const rows = core.elderRayIndex(period, bars)
      return [{ kind, periods: [period], unit: 'price', zeroLine: true, lines: [
        { key: 'bull', label: 'Bull Power', color: '#77cba5', series: rows.map(row => row?.bull ?? null) },
        { key: 'bear', label: 'Bear Power', color: '#e397a2', series: rows.map(row => row?.bear ?? null) },
      ] }]
    }
    if (kind === 'demarker') return [{ kind, periods: [period], lines: [
      { color: STUDIES[kind].color, series: core.demarker(period, bars) },
    ] }]
    if (kind === 'relative_vigor') {
      const rows = core.relativeVigor(period, bars)
      return [{ kind, periods: [period], lines: [
        { key: 'value', label: 'Vigor', color: STUDIES[kind].color, series: rows.map(row => row.vigor) },
        { key: 'signal', label: 'Signal', color: '#e9b879', series: rows.map(row => row.signal) },
      ] }]
    }
    if (kind === 'chaikin_volatility') {
      const comparison = study.volatilityLookback ?? EXTRA_STUDY_PERIODS.volatilityLookback.defaultPeriod
      return [{ kind, periods: [period, comparison], zeroLine: true, lines: [
        { color: STUDIES[kind].color, series: core.chaikinVolatility(period, comparison, bars) },
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
    if (kind === 'coppock') {
      const first = study.coppockFirstPeriod ?? EXTRA_STUDY_PERIODS.coppockFirstPeriod.defaultPeriod
      const second = study.coppockSecondPeriod ?? EXTRA_STUDY_PERIODS.coppockSecondPeriod.defaultPeriod
      return [{ kind, periods: [period, first, second], zeroLine: true, lines: [
        { color: STUDIES[kind].color, series: core.coppockCurve(period, first, second, bars) },
      ] }]
    }
    if (kind === 'cmo' || kind === 'trix') {
      const series = kind === 'cmo' ? core.chandeMomentumOscillator(period, bars) : core.trix(period, bars)
      return [{ kind, periods: [period], zeroLine: true, lines: [{ color: STUDIES[kind].color, series }] }]
    }
    if (kind === 'kaufman_efficiency') return [{ kind, periods: [period], guides: [0, 50, 100], lines: [
      { color: STUDIES[kind].color, series: core.kaufmanEfficiencyRatio(period, bars) },
    ] }]
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
export function studyPeriodOrderError(kind: StudyKind, settings: StudySettings): string | undefined {
  if (kind === 'ultimate') {
    const { period, ultimateMiddlePeriod: medium, ultimateLongPeriod: long } = settings
    if (period === undefined || medium === undefined || long === undefined || period >= medium || medium >= long)
      return 'The Ultimate Oscillator short, medium and long periods must increase in that order.'
    return
  }
  if (kind !== 'macd' && kind !== 'chaikin_oscillator' && kind !== 'ppo') return
  const slow = kind === 'macd' ? settings.slowPeriod :
    kind === 'ppo' ? settings.ppoSlowPeriod : settings.chaikinSlowPeriod
  if (settings.period === undefined || slow === undefined || settings.period >= slow)
    return `The ${STUDIES[kind].name} fast period must be shorter than the slow period.`
}

export function validStudyPeriod(kind: StudyKind, period: unknown): period is number {
  const description = STUDIES[kind]
  return 'minPeriod' in description && validIndicatorPeriod(period) && period >= description.minPeriod
}
