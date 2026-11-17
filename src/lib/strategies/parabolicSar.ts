import { createSignalStrategy, type TradingSignals } from './signalStrategy'
import type { Candle } from './types'

const ACCELERATION_STEP = 0.02
const MAX_ACCELERATION = 0.2

function getParabolicSarSignals(candles: Candle[]): TradingSignals {
  const enter = Array<boolean>(candles.length).fill(false)
  const exit = Array<boolean>(candles.length).fill(false)
  if (candles.length < 2) return { enter, exit }

  let uptrend = candles[1].c >= candles[0].c
  let sar = uptrend
    ? Math.min(candles[0].l, candles[1].l)
    : Math.max(candles[0].h, candles[1].h)
  let extremePoint = uptrend
    ? Math.max(candles[0].h, candles[1].h)
    : Math.min(candles[0].l, candles[1].l)
  let acceleration = ACCELERATION_STEP

  enter[1] = uptrend
  exit[1] = !uptrend

  for (let index = 2; index < candles.length; index += 1) {
    const candle = candles[index]
    let nextSar = sar + acceleration * (extremePoint - sar)

    if (uptrend) {
      nextSar = Math.min(nextSar, candles[index - 1].l, candles[index - 2].l)
      if (candle.l < nextSar) {
        uptrend = false
        sar = extremePoint
        extremePoint = candle.l
        acceleration = ACCELERATION_STEP
      } else {
        sar = nextSar
        if (candle.h > extremePoint) {
          extremePoint = candle.h
          acceleration = Math.min(acceleration + ACCELERATION_STEP, MAX_ACCELERATION)
        }
      }
    } else {
      nextSar = Math.max(nextSar, candles[index - 1].h, candles[index - 2].h)
      if (candle.h > nextSar) {
        uptrend = true
        sar = extremePoint
        extremePoint = candle.h
        acceleration = ACCELERATION_STEP
      } else {
        sar = nextSar
        if (candle.l < extremePoint) {
          extremePoint = candle.l
          acceleration = Math.min(acceleration + ACCELERATION_STEP, MAX_ACCELERATION)
        }
      }
    }

    enter[index] = uptrend
    exit[index] = !uptrend
  }

  return { enter, exit }
}

export const parabolicSarStrategy = createSignalStrategy(
  {
    id: 'parabolic-sar',
    name: 'Parabolic SAR',
    shortName: 'SAR',
    category: 'Technical Analysis',
    color: '#f5c2e7',
    description: 'Follow Parabolic SAR trend direction with a 0.02 acceleration step and 0.2 maximum.',
  },
  getParabolicSarSignals,
)
