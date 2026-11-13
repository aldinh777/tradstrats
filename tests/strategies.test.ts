import { describe, expect, test } from 'bun:test'
import { chartPoint } from '../src/lib/backtest'
import { buyAndHoldStrategy } from '../src/lib/strategies/buyAndHold'
import { constantProportionRebalancingStrategy } from '../src/lib/strategies/constantProportionRebalancing'
import { dollarCostAveragingStrategy } from '../src/lib/strategies/dollarCostAveraging'
import { fixedQuantityDcaStrategy } from '../src/lib/strategies/fixedQuantityDca'
import { nCandleMomentumStrategies } from '../src/lib/strategies/nCandleMomentum'
import { valueCostAveragingStrategy } from '../src/lib/strategies/valueCostAveraging'
import { MIN_ORDER_NOTIONAL, type Candle, type StrategyContext, type StrategyDefinition } from '../src/lib/strategies/types'

const context: StrategyContext = {
  startingBalance: 1_000,
  feeRate: 0,
}

function candles(prices: [number, number][]): Candle[] {
  return prices.map(([o, c], index) => ({
    t: index,
    o,
    h: Math.max(o, c),
    l: Math.min(o, c),
    c,
    v: 1,
  }))
}

function run(strategy: StrategyDefinition, data: Candle[], options = context) {
  return strategy.run(data, options)
}

describe('chart trade marker coordinates', () => {
  test('aligns marker points with the matching equity curve', () => {
    expect(chartPoint([[100, 200], [150, 300]], 1, 0)?.x).toBe(12)
    expect(chartPoint([[100, 200], [150, 300]], 1, 1)?.x).toBe(948)
    expect(chartPoint([[100, 200]], 0, 2)).toBeNull()
  })
})

describe('investing strategies', () => {
  test('buy and hold enters at the first candle open', () => {
    const result = run(buyAndHoldStrategy, candles([[100, 110], [200, 150]]))

    expect(result.unitsOwned).toBe(10)
    expect(result.finalBalance).toBe(1_500)
    expect(result.trades).toBe(1)
    expect(result.equity[0]).toBe(1_000)
    expect(result.equity[1]).toBe(1_100)
    expect(result.orders).toEqual([
      {
        timestamp: 0,
        side: 'buy',
        price: 100,
        quantity: 10,
        notional: 1_000,
        fee: 0,
      },
    ])
  })

  test('records filled quantity, notional, and fee for each buy', () => {
    const result = run(buyAndHoldStrategy, candles([[100, 100]]), {
      startingBalance: 1_000,
      feeRate: 0.01,
    })

    expect(result.orders[0]).toEqual({
      timestamp: 0,
      side: 'buy',
      price: 100,
      quantity: 9.9,
      notional: 990,
      fee: 10,
    })
  })

  test('DCA invests the same USD amount at each candle open', () => {
    const result = run(dollarCostAveragingStrategy, candles([[100, 100], [200, 200]]))

    expect(result.unitsOwned).toBe(7.5)
    expect(result.cashBalance).toBe(0)
    expect(result.trades).toBe(2)
    expect(result.orders.map(({ timestamp, side, notional, fee }) => ({
      timestamp,
      side,
      notional,
      fee,
    }))).toEqual([
      { timestamp: 0, side: 'buy', notional: 500, fee: 0 },
      { timestamp: 1, side: 'buy', notional: 500, fee: 0 },
    ])
  })

  test('constant portfolio rebalancing starts and rebalances to 50:50', () => {
    const result = run(
      constantProportionRebalancingStrategy,
      candles([[100, 100], [200, 200], [100, 100]]),
    )

    expect(result.orders.map(({ timestamp, side, notional }) => ({ timestamp, side, notional }))).toEqual([
      { timestamp: 0, side: 'buy', notional: 500 },
      { timestamp: 1, side: 'sell', notional: 250 },
      { timestamp: 2, side: 'buy', notional: 187.5 },
    ])
    expect(result.unitsOwned).toBe(5.625)
    expect(result.cashBalance).toBe(562.5)
    expect(result.trades).toBe(3)
  })

  test('value averaging follows a linear portfolio-value target', () => {
    const result = run(valueCostAveragingStrategy, candles([[100, 100], [200, 200], [300, 300], [100, 100]]))

    expect(result.unitsOwned).toBe(10)
    expect(result.cashBalance).toBe(0)
    expect(result.trades).toBe(2)
  })

  test('fixed-quantity DCA derives each purchase from the first open', () => {
    const result = run(fixedQuantityDcaStrategy, candles([[100, 100], [50, 50]]))

    expect(result.unitsOwned).toBe(10)
    expect(result.cashBalance).toBe(250)
    expect(result.trades).toBe(2)
  })

  test('never records an order below the $10 minimum notional', () => {
    const data = candles([
      [100, 110],
      [110, 120],
      [120, 110],
      [110, 90],
      [90, 100],
      [100, 80],
    ])
    const strategies = [
      buyAndHoldStrategy,
      dollarCostAveragingStrategy,
      constantProportionRebalancingStrategy,
      valueCostAveragingStrategy,
      fixedQuantityDcaStrategy,
      ...nCandleMomentumStrategies,
    ]

    for (const strategy of strategies) {
      const result = run(strategy, data)
      expect(result.orders.every((order) => order.notional >= MIN_ORDER_NOTIONAL)).toBe(true)
    }
  })

  test('skips investments when available order notional is below $10', () => {
    const smallBalanceContext = { startingBalance: 10, feeRate: 0.01 }
    const data = candles([[100, 100], [100, 100]])
    const strategies = [
      buyAndHoldStrategy,
      dollarCostAveragingStrategy,
      constantProportionRebalancingStrategy,
      valueCostAveragingStrategy,
      fixedQuantityDcaStrategy,
    ]

    for (const strategy of strategies) {
      expect(run(strategy, data, smallBalanceContext).orders).toHaveLength(0)
    }
  })
})

describe('N-candle momentum', () => {
  test('provides separately selectable strategies for N from one through seven', () => {
    expect(nCandleMomentumStrategies.map(({ name }) => name)).toEqual([
      '1-Candle Momentum',
      '2-Candle Momentum',
      '3-Candle Momentum',
      '4-Candle Momentum',
      '5-Candle Momentum',
      '6-Candle Momentum',
      '7-Candle Momentum',
    ])
  })

  test('uses each card’s N threshold and enters at the following candle open', () => {
    const data = candles([[100, 110], [200, 210], [300, 310], [400, 410], [500, 510]])
    const unitsOwned = nCandleMomentumStrategies.map((strategy) => run(strategy, data).unitsOwned)

    expect(unitsOwned).toEqual([5, 1_000 / 300, 2.5, 2, 0, 0, 0])
  })

  test('executes entry and exit at the open after each signal is confirmed', () => {
    const data = candles([[100, 110], [110, 120], [200, 190], [190, 180], [150, 160]])
    const result = run(nCandleMomentumStrategies[1], data)

    expect(result.trades).toBe(2)
    expect(result.unitsOwned).toBe(0)
    expect(result.cashBalance).toBe(750)
    expect(result.finalBalance).toBe(750)
    expect(result.orders.map(({ timestamp, side, price }) => ({ timestamp, side, price }))).toEqual([
      { timestamp: 2, side: 'buy', price: 200 },
      { timestamp: 4, side: 'sell', price: 150 },
    ])
  })

  test('does not execute a signal from the final candle without a next open', () => {
    const result = run(nCandleMomentumStrategies[1], candles([[100, 110], [110, 120]]))

    expect(result.trades).toBe(0)
    expect(result.unitsOwned).toBe(0)
    expect(result.cashBalance).toBe(1_000)
  })

})
