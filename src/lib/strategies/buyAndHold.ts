import { createBacktestResult } from './performance'
import { MIN_ORDER_NOTIONAL, type StrategyDefinition } from './types'

export const buyAndHoldStrategy: StrategyDefinition = {
  id: 'buy-and-hold',
  name: 'Buy & hold',
  category: 'Passive Investing',
  color: '#74baff',
  description: 'Buy at the first candle open and hold through the end of the test.',
  run(candles, { startingBalance, feeRate }) {
    const firstPrice = candles[0].o
    const fee = startingBalance * feeRate
    const quantity = (startingBalance - fee) / firstPrice
    const notional = quantity * firstPrice
    const hasOrder = notional >= MIN_ORDER_NOTIONAL
    const units = hasOrder ? quantity : 0
    const cash = hasOrder ? 0 : startingBalance
    const equity = [startingBalance, ...candles.map((candle) => cash + units * candle.c)]

    return createBacktestResult(equity, hasOrder ? 1 : 0, startingBalance, {
      unitsOwned: units,
      cashBalance: cash,
      feesPaid: hasOrder ? fee : 0,
      orders: hasOrder
        ? [{
            timestamp: candles[0].t,
            side: 'buy',
            price: firstPrice,
            quantity: units,
            notional,
            fee,
          }]
        : [],
    })
  },
}
