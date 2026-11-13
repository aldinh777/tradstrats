import { createBacktestResult } from './performance'
import type { StrategyDefinition } from './types'

export const buyAndHoldStrategy: StrategyDefinition = {
  id: 'buy-and-hold',
  name: 'Buy & hold',
  category: 'Passive Investing',
  color: '#b9f277',
  description: 'Buy at the first candle open and hold through the end of the test.',
  run(candles, { startingBalance, feeRate }) {
    const firstPrice = candles[0].o
    const units = (startingBalance * (1 - feeRate)) / firstPrice
    const equity = candles.map((candle) => units * candle.c)

    return createBacktestResult(equity, 1, startingBalance, {
      unitsOwned: units,
      cashBalance: 0,
      feesPaid: startingBalance * feeRate,
    })
  },
}
