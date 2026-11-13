import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const dcaStrategy: StrategyDefinition = {
  id: 'dca',
  name: 'DCA',
  color: '#74baff',
  description: 'Invest an equal dollar amount on every candle, then hold the purchases.',
  run(candles, { startingBalance, feeRate }) {
    const amountPerCandle = startingBalance / candles.length
    const equity: number[] = []
    let cash = startingBalance
    let units = 0
    let trades = 0
    let feesPaid = 0

    for (const candle of candles) {
      const amountToInvest = Math.min(amountPerCandle, cash)
      if (amountToInvest > 0) {
        units += (amountToInvest * (1 - feeRate)) / candle.c
        cash -= amountToInvest
        feesPaid += amountToInvest * feeRate
        trades += 1
      }
      equity.push(cash + units * candle.c)
    }

    return createBacktestResult(equity, trades, startingBalance, {
      unitsOwned: units,
      cashBalance: Math.max(cash, 0),
      feesPaid,
    })
  },
}
