import { createBacktestResult } from './performance'
import { MIN_ORDER_NOTIONAL, type StrategyDefinition, type TradeOrder } from './types'

export const constantProportionRebalancingStrategy: StrategyDefinition = {
  id: 'constant-proportion-rebalancing',
  name: 'Constant Proportion Rebalancing',
  shortName: '50:50',
  category: 'Systematic Investing',
  color: '#f9e2af',
  description: 'Start with equal asset and cash allocations, then rebalance to 50:50 at each candle open.',
  run(candles, { startingBalance, feeRate }) {
    const firstCandle = candles[0]
    const initialAssetBudget = startingBalance / 2
    const initialFee = initialAssetBudget * feeRate
    const initialUnits = (initialAssetBudget - initialFee) / firstCandle.o
    const initialNotional = initialUnits * firstCandle.o
    const initialOrderPlaced = initialNotional >= MIN_ORDER_NOTIONAL
    let units = initialOrderPlaced ? initialUnits : 0
    let cash = initialOrderPlaced ? startingBalance - initialAssetBudget : startingBalance
    let feesPaid = initialOrderPlaced ? initialFee : 0
    let trades = initialOrderPlaced ? 1 : 0
    const equity: number[] = [startingBalance]
    const orders: TradeOrder[] = initialOrderPlaced
      ? [{
          timestamp: firstCandle.t,
          side: 'buy',
          price: firstCandle.o,
          quantity: units,
          notional: initialNotional,
          fee: initialFee,
        }]
      : []

    equity.push(cash + units * firstCandle.c)

    for (let index = 1; index < candles.length; index += 1) {
      const candle = candles[index]
      const assetValue = units * candle.o
      const portfolioValue = assetValue + cash
      const targetAssetValue = portfolioValue / 2
      const difference = targetAssetValue - assetValue

      if (difference > 0 && cash > 0) {
        const budget = Math.min(difference / (1 - feeRate), cash)
        const quantity = (budget * (1 - feeRate)) / candle.o
        const notional = quantity * candle.o
        if (notional < MIN_ORDER_NOTIONAL) {
          equity.push(cash + units * candle.c)
          continue
        }
        const fee = budget * feeRate
        units += quantity
        cash -= budget
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
      } else if (difference < 0 && units > 0) {
        const quantity = Math.min(units, -difference / candle.o)
        const notional = quantity * candle.o
        if (notional < MIN_ORDER_NOTIONAL) {
          equity.push(cash + units * candle.c)
          continue
        }
        const fee = notional * feeRate
        units -= quantity
        cash += notional - fee
        feesPaid += fee
        trades += 1
        orders.push({
          timestamp: candle.t,
          side: 'sell',
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
