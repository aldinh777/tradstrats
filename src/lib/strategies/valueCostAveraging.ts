import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const valueCostAveragingStrategy: StrategyDefinition = {
  id: 'value-averaging',
  name: 'Value Averaging (VA)',
  shortName: 'VA',
  category: 'Systematic Investing',
  color: '#ff8fa3',
  description: 'Adjust holdings toward a linearly increasing target portfolio value.',
  run(candles, { startingBalance, feeRate }) {
    const equity: number[] = []
    let cash = startingBalance
    let units = 0
    let trades = 0
    let feesPaid = 0

    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index]
      const targetValue = (startingBalance * (index + 1)) / candles.length
      const currentValue = units * candle.o

      if (targetValue > currentValue && cash > 0) {
        const requiredBudget = (targetValue - currentValue) / (1 - feeRate)
        const amountToInvest = Math.min(requiredBudget, cash)
        if (amountToInvest > 0) {
          units += (amountToInvest * (1 - feeRate)) / candle.o
          cash -= amountToInvest
          feesPaid += amountToInvest * feeRate
          trades += 1
        }
      } else if (currentValue > targetValue && units > 0) {
        const unitsToSell = Math.min(units, (currentValue - targetValue) / candle.o)
        const saleValue = unitsToSell * candle.o
        units -= unitsToSell
        cash += saleValue * (1 - feeRate)
        feesPaid += saleValue * feeRate
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
