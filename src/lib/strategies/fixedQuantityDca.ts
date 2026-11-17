import { createBacktestResult } from './performance'
import { MIN_ORDER_NOTIONAL, type StrategyDefinition, type TradeOrder } from './types'

export const fixedQuantityDcaStrategy: StrategyDefinition = {
  id: 'fixed-quantity-dca',
  name: 'Fixed-Quantity DCA',
  shortName: 'FQDCA',
  category: 'Systematic Investing',
  color: '#74d5bb',
  description: 'Buy a fixed quantity at each candle open based on the first open and starting balance.',
  run(candles, { startingBalance, feeRate }) {
    const quantityPerCandle =
      (startingBalance / candles.length) * (1 - feeRate) / candles[0].o
    const equity: number[] = [startingBalance]
    let cash = startingBalance
    let units = 0
    let trades = 0
    let feesPaid = 0
    const orders: TradeOrder[] = []

    for (const candle of candles) {
      const plannedBudget = (quantityPerCandle * candle.o) / (1 - feeRate)
      const amountToInvest = Math.min(plannedBudget, cash)
      if (amountToInvest > 0) {
        const quantity = (amountToInvest * (1 - feeRate)) / candle.o
        const notional = quantity * candle.o
        if (notional < MIN_ORDER_NOTIONAL) {
          equity.push(cash + units * candle.c)
          continue
        }
        const fee = amountToInvest * feeRate
        units += quantity
        cash -= amountToInvest
        feesPaid += fee
        trades += 1
        orders.push({
          timestamp: candle.t,
          side: 'buy',
          price: candle.o,
          quantity,
          notional,
          fee,
        })
      }
      equity.push(cash + units * candle.c)
    }

    return createBacktestResult(equity, trades, startingBalance, {
      unitsOwned: units,
      cashBalance: Math.max(cash, 0),
      feesPaid,
      orders,
    })
  },
}
