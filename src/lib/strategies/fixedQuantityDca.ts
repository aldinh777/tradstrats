import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const fixedQuantityDcaStrategy: StrategyDefinition = {
  id: 'fixed-quantity-dca',
  name: 'Fixed-Quantity DCA',
  shortName: 'Fixed-Qty DCA',
  category: 'Systematic Investing',
  color: '#74d5bb',
  description: 'Buy a fixed quantity at each candle open based on the first open and starting balance.',
  run(candles, { startingBalance, feeRate }) {
    const quantityPerCandle =
      (startingBalance / candles.length) * (1 - feeRate) / candles[0].o
    const equity: number[] = []
    let cash = startingBalance
    let units = 0
    let trades = 0
    let feesPaid = 0

    for (const candle of candles) {
      const plannedBudget = (quantityPerCandle * candle.o) / (1 - feeRate)
      const amountToInvest = Math.min(plannedBudget, cash)
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
