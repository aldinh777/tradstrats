import { createBacktestResult } from './performance'
import { MIN_ORDER_NOTIONAL, type StrategyDefinition, type TradeOrder } from './types'

export const dollarCostAveragingStrategy: StrategyDefinition = {
  id: 'dca',
  name: 'Dollar Cost Averaging (DCA)',
  shortName: 'DCA',
  category: 'Systematic Investing',
  color: '#9aa3a8',
  description: 'Invest a fixed USD amount at each candle open, then hold the purchases.',
  run(candles, { startingBalance, feeRate }) {
    const amountPerCandle = startingBalance / candles.length
    const equity: number[] = [startingBalance]
    let cash = startingBalance
    let units = 0
    let trades = 0
    let feesPaid = 0
    const orders: TradeOrder[] = []

    for (const candle of candles) {
      const amountToInvest = Math.min(amountPerCandle, cash)
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
