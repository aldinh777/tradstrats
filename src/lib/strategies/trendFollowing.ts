import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const trendFollowingStrategy: StrategyDefinition = {
  id: 'trend-following',
  name: 'Trend following',
  color: '#d6a5ff',
  description: 'Hold when a candle closes higher than the previous one; exit on a lower close.',
  run(candles, { startingBalance, feeRate }) {
    const equity: number[] = [startingBalance]
    let cash = startingBalance
    let units = 0
    let inPosition = false
    let trades = 0
    let feesPaid = 0

    for (let index = 1; index < candles.length; index += 1) {
      const price = candles[index].c
      const previousPrice = candles[index - 1].c

      if (!inPosition && price > previousPrice) {
        feesPaid += cash * feeRate
        units = (cash * (1 - feeRate)) / price
        cash = 0
        inPosition = true
        trades += 1
      } else if (inPosition && price < previousPrice) {
        const saleValue = units * price
        feesPaid += saleValue * feeRate
        cash = saleValue * (1 - feeRate)
        units = 0
        inPosition = false
        trades += 1
      }

      equity.push(cash + units * price)
    }

    return createBacktestResult(equity, trades, startingBalance, {
      unitsOwned: units,
      cashBalance: cash,
      feesPaid,
    })
  },
}
