import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

function createNCandleMomentumStrategy(momentumN: number, color: string): StrategyDefinition {
  return {
    id: `n-candle-momentum-${momentumN}`,
    name: `${momentumN}-Candle Momentum`,
    shortName: `${momentumN}-Candle`,
    category: 'Momentum Trading',
    color,
    description: `Buy after ${momentumN} consecutive bullish candles and sell after ${momentumN} consecutive bearish candles.`,
    run(candles, { startingBalance, feeRate }) {
      const equity: number[] = []
      let cash = startingBalance
      let units = 0
      let inPosition = false
      let bullishCount = 0
      let bearishCount = 0
      let pendingAction: 'buy' | 'sell' | null = null
      let trades = 0
      let feesPaid = 0

      for (const candle of candles) {
        if (pendingAction === 'buy' && !inPosition && cash > 0) {
          feesPaid += cash * feeRate
          units = (cash * (1 - feeRate)) / candle.o
          cash = 0
          inPosition = true
          trades += 1
        } else if (pendingAction === 'sell' && inPosition) {
          const saleValue = units * candle.o
          feesPaid += saleValue * feeRate
          cash = saleValue * (1 - feeRate)
          units = 0
          inPosition = false
          trades += 1
        }
        pendingAction = null

        equity.push(cash + units * candle.c)

        if (candle.c > candle.o) {
          bullishCount += 1
          bearishCount = 0
        } else if (candle.c < candle.o) {
          bearishCount += 1
          bullishCount = 0
        } else {
          bullishCount = 0
          bearishCount = 0
        }

        if (!inPosition && bullishCount >= momentumN) {
          pendingAction = 'buy'
        } else if (inPosition && bearishCount >= momentumN) {
          pendingAction = 'sell'
        }
      }

      return createBacktestResult(equity, trades, startingBalance, {
        unitsOwned: units,
        cashBalance: cash,
        feesPaid,
      })
    },
  }
}

export const nCandleMomentumStrategies = [
  createNCandleMomentumStrategy(1, '#d6a5ff'),
  createNCandleMomentumStrategy(2, '#ffc16e'),
  createNCandleMomentumStrategy(3, '#f18f6d'),
  createNCandleMomentumStrategy(4, '#f5c2e7'),
  createNCandleMomentumStrategy(5, '#a6e3a1'),
  createNCandleMomentumStrategy(6, '#89b4fa'),
  createNCandleMomentumStrategy(7, '#fab387'),
]
