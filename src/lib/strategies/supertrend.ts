import { createSignalStrategy, type TradingSignals } from './signalStrategy'
import type { Candle } from './types'

const ATR_PERIOD = 10
const ATR_MULTIPLIER = 3

function calculateAtr(candles: Candle[]): number[] {
  const atr = Array<number>(candles.length).fill(Number.NaN)
  if (candles.length < ATR_PERIOD) return atr

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.h - candle.l
    const previousClose = candles[index - 1].c
    return Math.max(
      candle.h - candle.l,
      Math.abs(candle.h - previousClose),
      Math.abs(candle.l - previousClose),
    )
  })

  let initialSum = 0
  for (let index = 0; index < ATR_PERIOD; index += 1) {
    initialSum += trueRanges[index]
  }
  atr[ATR_PERIOD - 1] = initialSum / ATR_PERIOD

  for (let index = ATR_PERIOD; index < candles.length; index += 1) {
    atr[index] = (atr[index - 1] * (ATR_PERIOD - 1) + trueRanges[index]) / ATR_PERIOD
  }

  return atr
}

function getSupertrendSignals(candles: Candle[]): TradingSignals {
  const enter = Array<boolean>(candles.length).fill(false)
  const exit = Array<boolean>(candles.length).fill(false)
  const atr = calculateAtr(candles)
  const finalUpper = Array<number>(candles.length).fill(Number.NaN)
  const finalLower = Array<number>(candles.length).fill(Number.NaN)
  let direction = 0

  for (let index = ATR_PERIOD - 1; index < candles.length; index += 1) {
    const candle = candles[index]
    const midpoint = (candle.h + candle.l) / 2
    const basicUpper = midpoint + ATR_MULTIPLIER * atr[index]
    const basicLower = midpoint - ATR_MULTIPLIER * atr[index]

    if (index === ATR_PERIOD - 1) {
      finalUpper[index] = basicUpper
      finalLower[index] = basicLower
      direction = candle.c >= midpoint ? 1 : -1
    } else {
      const previousClose = candles[index - 1].c
      finalUpper[index] =
        basicUpper < finalUpper[index - 1] || previousClose > finalUpper[index - 1]
          ? basicUpper
          : finalUpper[index - 1]
      finalLower[index] =
        basicLower > finalLower[index - 1] || previousClose < finalLower[index - 1]
          ? basicLower
          : finalLower[index - 1]

      if (direction === -1 && candle.c > finalUpper[index]) direction = 1
      else if (direction === 1 && candle.c < finalLower[index]) direction = -1
    }

    enter[index] = direction === 1
    exit[index] = direction === -1
  }

  return { enter, exit }
}

export const supertrendStrategy = createSignalStrategy(
  {
    id: 'supertrend',
    name: 'Supertrend',
    category: 'Technical Analysis',
    color: '#fab387',
    description: 'Follow trend changes using ATR(10) with a 3× multiplier; enter bullish trends and exit bearish trends.',
  },
  getSupertrendSignals,
)
