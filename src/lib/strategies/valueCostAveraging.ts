import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const valueCostAveragingStrategy: StrategyDefinition = {
  id: 'value-cost-averaging',
  name: 'Value cost averaging',
  color: '#ff8fa3',
  description: 'Size a unit target from the first close, then buy an equal share on every candle.',
  run(candles, { startingBalance, feeRate }) {
    const targetUnits = startingBalance / candles[0].c
    const unitsPerCandle = targetUnits / candles.length
    const equity: number[] = []
    let cash = startingBalance
    let units = 0
    let trades = 0
    let feesPaid = 0

    for (const candle of candles) {
      const plannedCost = unitsPerCandle * candle.c
      const amountToInvest = Math.min(plannedCost, cash)
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
