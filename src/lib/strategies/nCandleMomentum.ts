import { createBacktestResult } from './performance'
import type { StrategyDefinition, TradeOrder } from './types'

function createNCandleMomentumStrategy(momentumN: number, color: string): StrategyDefinition {
  return {
    id: `n-candle-momentum-${momentumN}`,
    name: `${momentumN}-Candle Momentum`,
    shortName: `${momentumN}-CDM`,
    category: 'Candle Momentum',
    color,
    description: `Buy after ${momentumN} consecutive bullish candles and sell after ${momentumN} consecutive bearish candles.`,
    run(candles, { startingBalance, feeRate }) {
      const equity: number[] = [startingBalance]
      let cash = startingBalance
      let units = 0
      let inPosition = false
      let bullishCount = 0
      let bearishCount = 0
      let pendingAction: 'buy' | 'sell' | null = null
      let trades = 0
      let feesPaid = 0
      const orders: TradeOrder[] = []

      for (const candle of candles) {
        if (pendingAction === 'buy' && !inPosition && cash > 0) {
          const fee = cash * feeRate
          units = (cash * (1 - feeRate)) / candle.o
          const notional = units * candle.o
          feesPaid += fee
          orders.push({
            timestamp: candle.t,
            side: 'buy',
            price: candle.o,
            quantity: units,
            notional,
            fee,
          })
          cash = 0
          inPosition = true
          trades += 1
        } else if (pendingAction === 'sell' && inPosition) {
          const saleValue = units * candle.o
          const fee = saleValue * feeRate
          feesPaid += fee
          orders.push({
            timestamp: candle.t,
            side: 'sell',
            price: candle.o,
            quantity: units,
            notional: saleValue,
            fee,
          })
          cash = saleValue - fee
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
        orders,
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
