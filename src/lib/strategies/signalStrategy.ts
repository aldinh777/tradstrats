import { createBacktestResult } from './performance'
import {
  MIN_ORDER_NOTIONAL,
  type Candle,
  type StrategyContext,
  type StrategyDefinition,
  type StrategyOption,
  type TradeOrder,
} from './types'

export type TradingSignals = {
  enter: boolean[]
  exit: boolean[]
}

export function createSignalStrategy(
  option: StrategyOption,
  getSignals: (candles: Candle[]) => TradingSignals,
): StrategyDefinition {
  return {
    ...option,
    run(candles, context: StrategyContext) {
      const { enter, exit } = getSignals(candles)
      const equity = [context.startingBalance]
      const orders: TradeOrder[] = []
      let cash = context.startingBalance
      let units = 0
      let feesPaid = 0
      let pendingAction: 'buy' | 'sell' | null = null

      for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index]
        if (pendingAction === 'buy' && units === 0 && cash > 0) {
          const fee = cash * context.feeRate
          const quantity = (cash - fee) / candle.o
          const notional = quantity * candle.o
          if (notional >= MIN_ORDER_NOTIONAL) {
            units = quantity
            cash = 0
            feesPaid += fee
            orders.push({
              timestamp: candle.t,
              side: 'buy',
              price: candle.o,
              quantity,
              notional,
              fee,
            })
          }
        } else if (pendingAction === 'sell' && units > 0) {
          const notional = units * candle.o
          if (notional >= MIN_ORDER_NOTIONAL) {
            const fee = notional * context.feeRate
            cash = notional - fee
            feesPaid += fee
            orders.push({
              timestamp: candle.t,
              side: 'sell',
              price: candle.o,
              quantity: units,
              notional,
              fee,
            })
            units = 0
          }
        }
        pendingAction = null

        equity.push(cash + units * candle.c)

        if (index < candles.length - 1) {
          if (units === 0 && enter[index]) pendingAction = 'buy'
          else if (units > 0 && exit[index]) pendingAction = 'sell'
        }
      }

      return createBacktestResult(equity, orders.length, context.startingBalance, {
        unitsOwned: units,
        cashBalance: Math.max(cash, 0),
        feesPaid,
        orders,
      })
    },
  }
}
