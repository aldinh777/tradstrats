import { createSignalStrategy, type TradingSignals } from './signalStrategy'
import { parabolicSarStrategy } from './parabolicSar'
import { supertrendStrategy } from './supertrend'
import type { Candle } from './types'

const SMA_FAST_PERIOD = 9
const SMA_SLOW_PERIOD = 21
const EMA_FAST_PERIOD = 9
const EMA_SLOW_PERIOD = 21
const MACD_FAST_PERIOD = 12
const MACD_SLOW_PERIOD = 26
const MACD_SIGNAL_PERIOD = 9
const RSI_PERIOD = 14
const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70
const BOLLINGER_PERIOD = 20
const BOLLINGER_DEVIATIONS = 2
const DONCHIAN_PERIOD = 20

function simpleMovingAverage(values: number[], period: number): number[] {
  const averages = Array<number>(values.length).fill(Number.NaN)
  let sum = 0
  let runLength = 0

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!Number.isFinite(value)) {
      sum = 0
      runLength = 0
      continue
    }

    sum += value
    runLength += 1
    if (runLength > period) sum -= values[index - period]
    if (runLength >= period) averages[index] = sum / period
  }

  return averages
}

function exponentialMovingAverage(values: number[], period: number): number[] {
  const averages = Array<number>(values.length).fill(Number.NaN)
  const alpha = 2 / (period + 1)
  let seedSum = 0
  let runLength = 0
  let previousAverage = Number.NaN

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!Number.isFinite(value)) {
      seedSum = 0
      runLength = 0
      previousAverage = Number.NaN
      continue
    }

    if (!Number.isFinite(previousAverage)) {
      seedSum += value
      runLength += 1
      if (runLength === period) {
        previousAverage = seedSum / period
        averages[index] = previousAverage
      }
      continue
    }

    previousAverage = value * alpha + previousAverage * (1 - alpha)
    averages[index] = previousAverage
  }

  return averages
}

function relativeStrengthIndex(values: number[], period: number): number[] {
  const rsi = Array<number>(values.length).fill(Number.NaN)
  if (values.length <= period) return rsi

  let averageGain = 0
  let averageLoss = 0
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1]
    averageGain += Math.max(change, 0)
    averageLoss += Math.max(-change, 0)
  }
  averageGain /= period
  averageLoss /= period
  rsi[period] = getRsiValue(averageGain, averageLoss)

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1]
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period
    rsi[index] = getRsiValue(averageGain, averageLoss)
  }

  return rsi
}

function getRsiValue(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100
  const relativeStrength = averageGain / averageLoss
  return 100 - 100 / (1 + relativeStrength)
}

function emptySignals(length: number): TradingSignals {
  return {
    enter: Array<boolean>(length).fill(false),
    exit: Array<boolean>(length).fill(false),
  }
}

function createCrossSignals(fast: number[], slow: number[]): TradingSignals {
  const signals = emptySignals(fast.length)
  for (let index = 1; index < fast.length; index += 1) {
    if (
      Number.isFinite(fast[index - 1]) &&
      Number.isFinite(slow[index - 1]) &&
      Number.isFinite(fast[index]) &&
      Number.isFinite(slow[index])
    ) {
      signals.enter[index] = fast[index - 1] <= slow[index - 1] && fast[index] > slow[index]
      signals.exit[index] = fast[index - 1] >= slow[index - 1] && fast[index] < slow[index]
    }
  }
  return signals
}

function getCloses(candles: Candle[]): number[] {
  return candles.map((candle) => candle.c)
}

export const smaCrossStrategy = createSignalStrategy(
  {
    id: 'sma-cross',
    name: 'SMA Cross',
    shortName: 'SMA 9/21',
    category: 'Technical Analysis',
    color: '#89b4fa',
    description: 'Buy when the 9-period SMA crosses above the 21-period SMA; exit on a cross below.',
  },
  (candles) => createCrossSignals(
    simpleMovingAverage(getCloses(candles), SMA_FAST_PERIOD),
    simpleMovingAverage(getCloses(candles), SMA_SLOW_PERIOD),
  ),
)

export const emaCrossStrategy = createSignalStrategy(
  {
    id: 'ema-cross',
    name: 'EMA Cross',
    shortName: 'EMA 9/21',
    category: 'Technical Analysis',
    color: '#74c7ec',
    description: 'Buy when the 9-period EMA crosses above the 21-period EMA; exit on a cross below.',
  },
  (candles) => createCrossSignals(
    exponentialMovingAverage(getCloses(candles), EMA_FAST_PERIOD),
    exponentialMovingAverage(getCloses(candles), EMA_SLOW_PERIOD),
  ),
)

export const macdStrategy = createSignalStrategy(
  {
    id: 'macd',
    name: 'MACD',
    category: 'Technical Analysis',
    color: '#f9e2af',
    description: 'Buy when MACD (12, 26) crosses above its 9-period signal line; exit on a cross below.',
  },
  (candles) => {
    const closes = getCloses(candles)
    const fastEma = exponentialMovingAverage(closes, MACD_FAST_PERIOD)
    const slowEma = exponentialMovingAverage(closes, MACD_SLOW_PERIOD)
    const macd = fastEma.map((value, index) =>
      Number.isFinite(value) && Number.isFinite(slowEma[index])
        ? value - slowEma[index]
        : Number.NaN,
    )
    return createCrossSignals(macd, exponentialMovingAverage(macd, MACD_SIGNAL_PERIOD))
  },
)

export const rsiMeanReversionStrategy = createSignalStrategy(
  {
    id: 'rsi-mean-reversion',
    name: 'RSI Mean Reversion',
    shortName: 'RSI',
    category: 'Technical Analysis',
    color: '#f38ba8',
    description: 'Buy when 14-period RSI crosses below 30; exit when it crosses above 70.',
  },
  (candles) => {
    const rsi = relativeStrengthIndex(getCloses(candles), RSI_PERIOD)
    const signals = emptySignals(candles.length)
    for (let index = 1; index < rsi.length; index += 1) {
      signals.enter[index] =
        Number.isFinite(rsi[index]) &&
        rsi[index] < RSI_OVERSOLD &&
        (!Number.isFinite(rsi[index - 1]) || rsi[index - 1] >= RSI_OVERSOLD)
      signals.exit[index] =
        rsi[index - 1] <= RSI_OVERBOUGHT && rsi[index] > RSI_OVERBOUGHT
    }
    return signals
  },
)

export const bollingerBandReversionStrategy = createSignalStrategy(
  {
    id: 'bollinger-band-reversion',
    name: 'Bollinger Band Reversion',
    shortName: 'BB Rev',
    category: 'Technical Analysis',
    color: '#cba6f7',
    description: 'Buy when price crosses below the 20-period lower band (2σ); exit when it crosses above the middle band.',
  },
  (candles) => {
    const closes = getCloses(candles)
    const middleBand = simpleMovingAverage(closes, BOLLINGER_PERIOD)
    const lowerBand = middleBand.map((middle, index) => {
      if (!Number.isFinite(middle)) return Number.NaN
      const start = index - BOLLINGER_PERIOD + 1
      let squaredDifferences = 0
      for (let sample = start; sample <= index; sample += 1) {
        squaredDifferences += (closes[sample] - middle) ** 2
      }
      const standardDeviation = Math.sqrt(squaredDifferences / BOLLINGER_PERIOD)
      return middle - BOLLINGER_DEVIATIONS * standardDeviation
    })
    const signals = emptySignals(candles.length)
    for (let index = 1; index < candles.length; index += 1) {
      signals.enter[index] =
        closes[index - 1] >= lowerBand[index - 1] && closes[index] < lowerBand[index]
      signals.exit[index] =
        closes[index - 1] <= middleBand[index - 1] && closes[index] > middleBand[index]
    }
    return signals
  },
)

export const donchianBreakoutStrategy = createSignalStrategy(
  {
    id: 'donchian-breakout',
    name: 'Donchian Breakout',
    shortName: 'Donbr',
    category: 'Technical Analysis',
    color: '#94e2d5',
    description: 'Buy on a close above the previous 20-candle high; exit on a close below the previous 20-candle low.',
  },
  (candles) => {
    const signals = emptySignals(candles.length)
    for (let index = DONCHIAN_PERIOD; index < candles.length; index += 1) {
      let channelHigh = Number.NEGATIVE_INFINITY
      let channelLow = Number.POSITIVE_INFINITY
      for (let sample = index - DONCHIAN_PERIOD; sample < index; sample += 1) {
        channelHigh = Math.max(channelHigh, candles[sample].h)
        channelLow = Math.min(channelLow, candles[sample].l)
      }
      signals.enter[index] = candles[index].c > channelHigh
      signals.exit[index] = candles[index].c < channelLow
    }
    return signals
  },
)

export const technicalAnalysisStrategies = [
  smaCrossStrategy,
  emaCrossStrategy,
  macdStrategy,
  rsiMeanReversionStrategy,
  bollingerBandReversionStrategy,
  donchianBreakoutStrategy,
  supertrendStrategy,
  parabolicSarStrategy,
]
