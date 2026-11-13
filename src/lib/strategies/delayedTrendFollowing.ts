import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const delayedTrendFollowingStrategy: StrategyDefinition = {
  id: 'delayed-trend-following',
  name: 'Delayed trend following',
  color: '#ffc16e',
  description: 'Buy after 2 consecutive higher closes; exit after 2 consecutive lower closes.',
  run(candles, { startingBalance, feeRate }) {
    const equity: number[] = [startingBalance]
    let cash = startingBalance
    let units = 0
    let inPosition = false
    let upCloses = 0
    let downCloses = 0
    let trades = 0
    let feesPaid = 0

    for (let index = 1; index < candles.length; index += 1) {
      const price = candles[index].c
      const previousPrice = candles[index - 1].c

      if (price > previousPrice) {
        upCloses += 1
        downCloses = 0
      } else if (price < previousPrice) {
        downCloses += 1
        upCloses = 0
      } else {
        upCloses = 0
        downCloses = 0
      }

      if (!inPosition && upCloses >= 2) {
        feesPaid += cash * feeRate
        units = (cash * (1 - feeRate)) / price
        cash = 0
        inPosition = true
        upCloses = 0
        trades += 1
      } else if (inPosition && downCloses >= 2) {
        const saleValue = units * price
        feesPaid += saleValue * feeRate
        cash = saleValue * (1 - feeRate)
        units = 0
        inPosition = false
        downCloses = 0
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
