import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const dollarCostAveragingStrategy: StrategyDefinition = {
  id: 'dca',
  name: 'Dollar Cost Averaging (DCA)',
  shortName: 'DCA',
  category: 'Systematic Investing',
  color: '#74baff',
  description: 'Invest a fixed USD amount at each candle open, then hold the purchases.',
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
        units += (amountToInvest * (1 - feeRate)) / candle.o
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
