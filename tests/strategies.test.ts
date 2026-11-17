import { describe, expect, test } from 'bun:test'
import { chartPoint, chartPointForRange } from '../src/lib/backtest'
import { buyAndHoldStrategy } from '../src/lib/strategies/buyAndHold'
import { constantProportionRebalancingStrategy } from '../src/lib/strategies/constantProportionRebalancing'
import { dollarCostAveragingStrategy } from '../src/lib/strategies/dollarCostAveraging'
import { fixedQuantityDcaStrategy } from '../src/lib/strategies/fixedQuantityDca'
import { nCandleMomentumStrategies } from '../src/lib/strategies/nCandleMomentum'
import {
  bollingerBandReversionStrategy,
  donchianBreakoutStrategy,
  emaCrossStrategy,
  macdStrategy,
  rsiMeanReversionStrategy,
  smaCrossStrategy,
  technicalAnalysisStrategies,
} from '../src/lib/strategies/technicalAnalysis'
import { parabolicSarStrategy } from '../src/lib/strategies/parabolicSar'
import { supertrendStrategy } from '../src/lib/strategies/supertrend'
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

  test('positions price markers by execution price on the shared price scale', () => {
    expect(chartPointForRange(150, 1, 3, 100, 200)).toEqual({ x: 480, y: 160 })
    expect(chartPointForRange(150, 0.5, 3, 100, 200)?.x).toBe(246)
    expect(chartPointForRange(150, 3, 3, 100, 200)).toBeNull()
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
      ...technicalAnalysisStrategies,
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

describe('technical analysis strategies', () => {
  test('registers the eight requested strategies in the technical analysis category', () => {
    expect(technicalAnalysisStrategies.map(({ name, category }) => ({ name, category }))).toEqual([
      { name: 'SMA Cross', category: 'Technical Analysis' },
      { name: 'EMA Cross', category: 'Technical Analysis' },
      { name: 'MACD', category: 'Technical Analysis' },
      { name: 'RSI Mean Reversion', category: 'Technical Analysis' },
      { name: 'Bollinger Band Reversion', category: 'Technical Analysis' },
      { name: 'Donchian Breakout', category: 'Technical Analysis' },
      { name: 'Supertrend', category: 'Technical Analysis' },
      { name: 'Parabolic SAR', category: 'Technical Analysis' },
    ])
  })

  test('executes Donchian breakouts at the next candle open without using the current candle in its channel', () => {
    const data = candles(
      Array.from({ length: 20 }, () => [100, 100] as [number, number]).concat([
        [101, 110],
        [105, 105],
        [90, 90],
        [95, 95],
      ]),
    )
    const result = run(donchianBreakoutStrategy, data)

    expect(result.orders.map(({ timestamp, side, price }) => ({ timestamp, side, price }))).toEqual([
      { timestamp: 21, side: 'buy', price: 105 },
      { timestamp: 23, side: 'sell', price: 95 },
    ])
  })

  test('executes SMA, EMA, and MACD cross signals at the following candle open', () => {
    const declining = Array.from({ length: 60 }, (_, index) => {
      const price = 200 - index
      return [price, price] as [number, number]
    })
    const rising = Array.from({ length: 30 }, (_, index) => {
      const price = 150 + (index + 1) * 10
      return [price, price] as [number, number]
    })
    const data = candles([...declining, ...rising]).map((candle) => ({
      ...candle,
      o: candle.c + 3,
      h: Math.max(candle.h, candle.c + 3),
    }))

    for (const strategy of [smaCrossStrategy, emaCrossStrategy, macdStrategy]) {
      const result = run(strategy, data)
      const firstOrder = result.orders[0]
      expect(firstOrder).toBeDefined()
      if (!firstOrder) continue
      expect(firstOrder.side).toBe('buy')
      expect(firstOrder.timestamp).toBeGreaterThanOrEqual(strategy.id === 'macd' ? 34 : 21)
      expect(firstOrder.price).toBe(data[firstOrder.timestamp].o)
    }
  })

  test('enters RSI mean reversion on an initially oversold RSI and executes next candle', () => {
    const declining = Array.from({ length: 15 }, (_, index) => {
      const price = 100 - index * 2
      return [price, price] as [number, number]
    })
    const data = candles([...declining, [70, 70]])
    const result = run(rsiMeanReversionStrategy, data)

    expect(result.orders[0]).toMatchObject({ timestamp: 15, side: 'buy', price: 70 })
  })

  test('enters below the lower Bollinger band and exits at the next candle open after reverting to the middle', () => {
    const data = candles([
      ...Array.from({ length: 20 }, () => [100, 100] as [number, number]),
      [60, 60],
      [55, 100],
      [110, 110],
    ])
    const result = run(bollingerBandReversionStrategy, data)

    expect(result.orders.map(({ timestamp, side, price }) => ({ timestamp, side, price }))).toEqual([
      { timestamp: 21, side: 'buy', price: 55 },
      { timestamp: 22, side: 'sell', price: 110 },
    ])
  })

  test('executes Supertrend and Parabolic SAR direction changes on the next candle open', () => {
    const data = candles([
      ...Array.from({ length: 15 }, () => [100, 100] as [number, number]),
      [100, 120],
      [80, 80],
      [70, 70],
    ])

    const supertrendResult = run(supertrendStrategy, data)
    expect(supertrendResult.orders.map(({ timestamp, side, price }) => ({ timestamp, side, price }))).toEqual([
      { timestamp: 10, side: 'buy', price: 100 },
      { timestamp: 17, side: 'sell', price: 70 },
    ])

    const parabolicSarResult = run(parabolicSarStrategy, data)
    expect(parabolicSarResult.orders.map(({ timestamp, side, price }) => ({ timestamp, side, price }))).toEqual([
      { timestamp: 2, side: 'buy', price: 100 },
      { timestamp: 17, side: 'sell', price: 70 },
    ])
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
