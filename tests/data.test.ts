import { describe, expect, test } from 'bun:test'
import {
  calculateAnalyticsMetrics,
  calculateCombinedPortfolioMetrics,
  combineTokenPerformanceSeries,
  sortAnalyticsResults,
  type AnalyticsMetrics,
} from '../src/lib/analytics'
import {
  HistoricalDataCache,
  makeCacheKey,
  planMissingRanges,
  type HistoricalDataStore,
} from '../src/lib/data/cache'
import { createFrankfurterProvider } from '../src/lib/data/providers/frankfurter'
import { createHyperliquidProvider } from '../src/lib/data/providers/hyperliquid'
import type {
  CachedRange,
  CachedSeriesSummary,
  DataProvider,
  HistoricalRange,
  MarketInstrument,
} from '../src/lib/data/types'
import type { Candle } from '../src/lib/strategies/types'

const DAY = 24 * 60 * 60 * 1000
const instrument: MarketInstrument = {
  id: 'frankfurter:EUR/USD',
  providerId: 'frankfurter',
  symbol: 'EUR/USD',
  name: 'Euro to United States Dollar',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  marketType: 'forex',
}

class MemoryHistoricalDataStore implements HistoricalDataStore {
  coverage = new Map<string, CachedRange[]>()
  candles = new Map<string, Candle[]>()

  async getCoverage(key: string) {
    return this.coverage.get(key) ?? []
  }

  async getCandles(key: string) {
    return this.candles.get(key) ?? []
  }

  async listSeriesSummaries(): Promise<CachedSeriesSummary[]> {
    const keys = new Set([...this.candles.keys(), ...this.coverage.keys()])
    return [...keys].map((key) => {
      const [providerId, instrumentId, interval] = key.split('|')
      if (providerId !== 'hyperliquid' && providerId !== 'frankfurter') {
        throw new Error(`Unsupported provider key: ${key}`)
      }
      const candles = this.candles.get(key) ?? []
      return {
        key,
        providerId,
        instrumentId,
        interval,
        candleCount: candles.length,
        firstTimestamp: candles.length ? candles[0].t : null,
        lastTimestamp: candles.length ? candles[candles.length - 1].t : null,
        coverage: this.coverage.get(key) ?? [],
      }
    })
  }

  async replaceRange(
    key: string,
    range: HistoricalRange,
    fetchedAt: number,
    candles: Candle[],
    coverageEndTime = range.endTime,
  ) {
    const existing = (this.candles.get(key) ?? []).filter(
      (candle) => candle.t < range.startTime || candle.t > range.endTime,
    )
    this.candles.set(key, [...existing, ...candles].sort((a, b) => a.t - b.t))
    const coverage = (this.coverage.get(key) ?? []).flatMap((item) => {
      if (item.startTime > range.endTime || item.endTime < range.startTime) return [item]
      return [
        ...(item.startTime < range.startTime
          ? [{ ...item, endTime: range.startTime - 1 }]
          : []),
        ...(item.endTime > range.endTime
          ? [{ ...item, startTime: range.endTime + 1 }]
          : []),
      ]
    })
    if (coverageEndTime >= range.startTime) {
      coverage.push({
        startTime: range.startTime,
        endTime: Math.min(range.endTime, coverageEndTime),
        fetchedAt,
      })
    }
    this.coverage.set(key, coverage)
  }

  async clear() {
    this.coverage.clear()
    this.candles.clear()
  }
}

describe('Frankfurter provider', () => {
  test('loads currency pairs dynamically and treats rates as daily close-only observations', async () => {
    const urls: string[] = []
    const provider = createFrankfurterProvider(async (input) => {
      const url = input.toString()
      urls.push(url)
      if (url.endsWith('/currencies')) {
        return new Response(JSON.stringify({ EUR: 'Euro', USD: 'US Dollar', JPY: 'Yen' }))
      }
      return new Response(JSON.stringify({
        amount: 1,
        base: 'EUR',
        start_date: '2023-12-29',
        end_date: '2024-01-03',
        rates: {
          '2023-12-29': { USD: 1.1 },
          '2024-01-02': { USD: 1.11 },
          '2024-01-03': { USD: 1.12 },
        },
      }))
    })

    const markets = await provider.listInstruments()
    const pair = markets.find((market) => market.id === 'frankfurter:EUR/USD')
    expect(markets).toHaveLength(2)
    expect(markets.every((market) => market.quoteCurrency === 'USD')).toBe(true)
    expect(markets.some((market) => market.id === 'frankfurter:USD/EUR')).toBe(false)
    expect(pair).toBeDefined()
    if (!pair) return

    const candles = await provider.fetchCandles(
      pair,
      '1d',
      Date.UTC(2024, 0, 1),
      Date.UTC(2024, 0, 3, 23, 59, 59, 999),
    )
    expect(candles).toEqual([
      { t: Date.UTC(2024, 0, 2), o: 1.11, h: 1.11, l: 1.11, c: 1.11, v: null },
      { t: Date.UTC(2024, 0, 3), o: 1.12, h: 1.12, l: 1.12, c: 1.12, v: null },
    ])
    expect(new URL(urls[1]).searchParams.get('base')).toBe('EUR')
    expect(new URL(urls[1]).searchParams.get('symbols')).toBe('USD')
    expect(urls[1]).toContain('/2024-01-01..2024-01-03')
  })

  test('rejects unsupported intervals rather than inventing intraday data', async () => {
    const provider = createFrankfurterProvider(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    )
    await expect(provider.fetchCandles(instrument, '12h', 0, DAY)).rejects.toThrow(
      'Frankfurter provides daily reference rates only.',
    )
  })

  test('requires USD in the live supported-currency catalog', async () => {
    const provider = createFrankfurterProvider(async () =>
      new Response(JSON.stringify({ EUR: 'Euro', JPY: 'Yen' }), { status: 200 }),
    )
    await expect(provider.listInstruments()).rejects.toThrow(
      'Frankfurter did not list USD as a supported quote currency.',
    )
  })
})

describe('Hyperliquid provider', () => {
  test('paginates candleSnapshot responses at the documented 500-record limit', async () => {
    let requests = 0
    const provider = createHyperliquidProvider(async () => {
      requests += 1
      const page = requests === 1
        ? Array.from({ length: 500 }, (_, index) => ({
            t: index * DAY,
            o: 100,
            h: 110,
            l: 90,
            c: 105,
            v: 10,
          }))
        : [500, 501].map((index) => ({
            t: index * DAY,
            o: 100,
            h: 110,
            l: 90,
            c: 105,
            v: 10,
          }))
      return new Response(JSON.stringify(page))
    })

    const market = {
      ...instrument,
      id: 'hyperliquid:BTC',
      providerId: 'hyperliquid' as const,
      symbol: 'BTC/USD',
      baseCurrency: 'BTC',
      marketType: 'perpetual' as const,
    }
    const candles = await provider.fetchCandles(market, '1d', 0, 501 * DAY)

    expect(requests).toBe(2)
    expect(candles).toHaveLength(502)
    expect(candles[500].t).toBe(500 * DAY)
  })

  test('allows empty partial responses for a cache gap with no new candle', async () => {
    const provider = createHyperliquidProvider(async () => new Response(JSON.stringify([])))
    const market = {
      ...instrument,
      id: 'hyperliquid:BTC',
      providerId: 'hyperliquid' as const,
      symbol: 'BTC/USD',
      baseCurrency: 'BTC',
      marketType: 'perpetual' as const,
    }

    await expect(provider.fetchCandles(market, '1d', DAY, DAY + 1000)).resolves.toEqual([])
  })
})

describe('historical cache', () => {
  test('refreshes Hyperliquid recent candles and excludes the still-open candle', async () => {
    const market: MarketInstrument = {
      ...instrument,
      id: 'hyperliquid:BTC',
      providerId: 'hyperliquid',
      symbol: 'BTC/USD',
      baseCurrency: 'BTC',
      marketType: 'perpetual',
    }
    const now = Date.UTC(2026, 0, 10, 12)
    const today = Date.UTC(2026, 0, 10)
    const yesterday = today - DAY
    const range = { startTime: Date.UTC(2026, 0, 1), endTime: now }
    const key = makeCacheKey(market, '1d')
    const store = new MemoryHistoricalDataStore()
    store.coverage.set(key, [{ ...range, fetchedAt: now }])
    store.candles.set(key, [
      { t: yesterday, o: 90, h: 100, l: 85, c: 99, v: 10 },
      { t: today, o: 99, h: 105, l: 95, c: 100, v: 2 },
    ])
    const requested: HistoricalRange[] = []
    const provider: DataProvider = {
      id: 'hyperliquid',
      name: 'Hyperliquid',
      description: '',
      timeframes: [{ value: '1d', label: 'Daily', apiInterval: '1d' }],
      listInstruments: async () => [market],
      fetchCandles: async (_instrument, _interval, startTime, endTime) => {
        requested.push({ startTime, endTime })
        return [
          { t: yesterday, o: 90, h: 112, l: 85, c: 110, v: 20 },
          { t: today, o: 110, h: 120, l: 108, c: 118, v: 3 },
        ]
      },
    }
    const cache = new HistoricalDataCache(store, () => now, () => provider)

    const candles = await cache.getCandles(market, '1d', range)

    expect(requested).toEqual([{
      startTime: now - 4 * DAY,
      endTime: now,
    }])
    expect(candles.at(-1)).toEqual({
      t: yesterday,
      o: 90,
      h: 112,
      l: 85,
      c: 110,
      v: 20,
    })
    expect(candles.some((candle) => candle.t === today)).toBe(false)
    expect((await store.getCandles(key)).some((candle) => candle.t === today)).toBe(false)
  })

  test('lists cached series metadata and reads its stored candle rows', async () => {
    const store = new MemoryHistoricalDataStore()
    const key = makeCacheKey(instrument, '1d')
    const candle = { t: DAY, o: 1.1, h: 1.2, l: 1, c: 1.15, v: null }
    const coverage = { startTime: DAY, endTime: 2 * DAY, fetchedAt: 3 * DAY }
    store.candles.set(key, [candle])
    store.coverage.set(key, [coverage])
    const cache = new HistoricalDataCache(store)

    await expect(cache.listCachedSeries()).resolves.toEqual([{
      key,
      providerId: 'frankfurter',
      instrumentId: instrument.id,
      interval: '1d',
      candleCount: 1,
      firstTimestamp: DAY,
      lastTimestamp: DAY,
      coverage: [coverage],
    }])
    await expect(cache.getCachedCandles(key)).resolves.toEqual([candle])
  })

  test('fetches only uncovered ranges and merges overlapping records without duplicates', async () => {
    const store = new MemoryHistoricalDataStore()
    const key = makeCacheKey(instrument, '1d')
    const now = 10 * DAY
    store.coverage.set(key, [{ startTime: DAY, endTime: 3 * DAY, fetchedAt: now }])
    store.candles.set(key, [
      { t: DAY, o: 1, h: 1, l: 1, c: 1, v: null },
      { t: 2 * DAY, o: 1, h: 1, l: 1, c: 1, v: null },
      { t: 3 * DAY, o: 1, h: 1, l: 1, c: 1, v: null },
    ])
    const fetched: HistoricalRange[] = []
    const provider = {
      id: 'frankfurter',
      name: 'Frankfurter',
      description: '',
      timeframes: [{ value: '1d', label: 'Daily', apiInterval: '1d' }],
      listInstruments: async () => [instrument],
      fetchCandles: async (_market, _interval, startTime, endTime) => {
        fetched.push({ startTime, endTime })
        return [4, 5].map((day) => ({
          t: day * DAY,
          o: 1,
          h: 1,
          l: 1,
          c: 1,
          v: null,
        }))
      },
    } satisfies DataProvider
    const cache = new HistoricalDataCache(store, () => now, () => provider)
    const candles = await cache.getCandles(instrument, '1d', {
      startTime: DAY,
      endTime: 5 * DAY,
    })

    expect(fetched).toEqual([{ startTime: 3 * DAY + 1, endTime: 5 * DAY }])
    expect(candles.map((candle) => candle.t)).toEqual([DAY, 2 * DAY, 3 * DAY, 4 * DAY, 5 * DAY])
  })

  test('does not replace cached data when refreshing a range fails', async () => {
    const store = new MemoryHistoricalDataStore()
    const key = makeCacheKey(instrument, '1d')
    const cachedCandle: Candle = { t: DAY, o: 1, h: 1, l: 1, c: 1, v: null }
    const cachedCoverage: CachedRange = { startTime: DAY, endTime: 2 * DAY, fetchedAt: 0 }
    store.candles.set(key, [cachedCandle])
    store.coverage.set(key, [cachedCoverage])
    const provider = {
      id: 'frankfurter',
      name: 'Frankfurter',
      description: '',
      timeframes: [{ value: '1d', label: 'Daily', apiInterval: '1d' }],
      listInstruments: async () => [instrument],
      fetchCandles: async () => {
        throw new Error('network unavailable')
      },
    } satisfies DataProvider
    const cache = new HistoricalDataCache(store, () => 2 * DAY, () => provider)

    await expect(cache.getCandles(instrument, '1d', {
      startTime: DAY,
      endTime: 2 * DAY,
    })).rejects.toThrow('network unavailable')
    expect(store.candles.get(key)).toEqual([cachedCandle])
    expect(store.coverage.get(key)).toEqual([cachedCoverage])
  })

  test('plans missing sections around overlapping fresh coverage', () => {
    expect(planMissingRanges(
      { startTime: 1, endTime: 10 },
      [
        { startTime: 3, endTime: 5, fetchedAt: 100 },
        { startTime: 5, endTime: 8, fetchedAt: 100 },
      ],
      101,
    )).toEqual([
      { startTime: 1, endTime: 2 },
      { startTime: 9, endTime: 10 },
    ])
  })
})

describe('analytics metrics', () => {
  test('combines token curves with equal initial weights and excludes currency markets', () => {
    const firstDay = Date.UTC(2026, 0, 1)
    const secondDay = firstDay + DAY
    const token = (id: string, candles: Candle[], equity: number[]) => ({
      instrument: {
        ...instrument,
        id,
        providerId: 'hyperliquid' as const,
        symbol: `${id.split(':')[1]}/USD`,
        baseCurrency: id.split(':')[1],
        marketType: 'perpetual' as const,
      },
      candles,
      result: {
        equity,
        totalReturn: 0,
        maxDrawdown: 0,
        trades: 0,
        finalBalance: equity[equity.length - 1],
        unitsOwned: 0,
        cashBalance: 0,
        feesPaid: 0,
        orders: [],
      },
      color: '#fff',
    })
    const first = token('hyperliquid:BTC', [
      { t: firstDay, o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: secondDay, o: 1, h: 1, l: 1, c: 1, v: 1 },
    ], [10_000, 11_000, 12_000])
    const second = token('hyperliquid:ETH', [
      { t: firstDay, o: 1, h: 1, l: 1, c: 1, v: 1 },
    ], [10_000, 9_000])
    const currencies = {
      ...second,
      instrument: instrument,
    }

    const portfolio = combineTokenPerformanceSeries([first, second, currencies])

    expect(portfolio.marketCount).toBe(2)
    expect(portfolio.points.map(({ value }) => value)).toEqual([100, 100, 105])
  })

  test('calculates combined portfolio value, performance, drawdown, and risk metrics from its index', () => {
    const metrics = calculateCombinedPortfolioMetrics({
      marketCount: 2,
      points: [
        { timestamp: 1, value: 100 },
        { timestamp: 2, value: 110 },
        { timestamp: 3, value: 99 },
      ],
    }, 10_000, 1_234)

    expect(metrics.currentIndex).toBe(99)
    expect(metrics.currentValue).toBe(9_900)
    expect(metrics.highestValue).toBe(11_000)
    expect(metrics.averageValue).toBe(10_300)
    expect(metrics.absoluteReturn).toBe(-100)
    expect(metrics.percentageReturn).toBeCloseTo(-1)
    expect(metrics.maxDrawdown).toBe(10)
    expect(metrics.annualizedVolatility).toBeCloseTo(Math.sqrt(5.04) * 100)
    expect(metrics.sharpeRatio).toBeCloseTo(0)
    expect(metrics.totalDollarVolume).toBe(1_234)
  })

  test('leaves combined portfolio metrics unavailable when its series is empty', () => {
    const metrics = calculateCombinedPortfolioMetrics({ points: [], marketCount: 0 }, 10_000)

    expect(metrics.currentValue).toBeNull()
    expect(metrics.absoluteReturn).toBeNull()
    expect(metrics.maxDrawdown).toBeNull()
    expect(metrics.annualizedVolatility).toBeNull()
    expect(metrics.sharpeRatio).toBeNull()
  })

  test('reports quote-currency performance and leaves unavailable source volume unavailable', () => {
    const metrics = calculateAnalyticsMetrics(
      [
        { t: 1, o: 1, h: 1, l: 1, c: 1, v: null },
        { t: 2, o: 2, h: 2, l: 2, c: 2, v: null },
      ],
      {
        equity: [100, 100, 110],
        totalReturn: 10,
        maxDrawdown: 0,
        trades: 1,
        finalBalance: 110,
        unitsOwned: 100,
        cashBalance: 0,
        feesPaid: 0,
        orders: [],
      },
      100,
      'USD',
    )

    expect(metrics).toMatchObject({
      lastPrice: 2,
      highestPrice: 2,
      lowestPrice: 1,
      averagePrice: 1.5,
      absoluteReturn: 10,
      percentageReturn: 10,
      maxDrawdown: 0,
      totalDollarVolume: null,
    })
    expect(metrics.annualizedVolatility).not.toBeNull()
    expect(metrics.sharpeRatio).not.toBeNull()
  })

  test('returns unavailable risk metrics when there are too few equity observations', () => {
    const metrics = calculateAnalyticsMetrics(
      [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 0 }],
      {
        equity: [100],
        totalReturn: 0,
        maxDrawdown: 0,
        trades: 0,
        finalBalance: 100,
        unitsOwned: 0,
        cashBalance: 100,
        feesPaid: 0,
        orders: [],
      },
      100,
      'USD',
    )
    expect(metrics.annualizedVolatility).toBeNull()
    expect(metrics.sharpeRatio).toBeNull()
    expect(metrics.totalDollarVolume).toBe(0)
  })

  test('converts provided base-asset volume to USD using each candle close', () => {
    const metrics = calculateAnalyticsMetrics(
      [
        { t: 1, o: 10, h: 10, l: 10, c: 10, v: 3 },
        { t: 2, o: 12, h: 12, l: 12, c: 12, v: 5 },
      ],
      {
        equity: [100, 100, 100],
        totalReturn: 0,
        maxDrawdown: 0,
        trades: 0,
        finalBalance: 100,
        unitsOwned: 0,
        cashBalance: 100,
        feesPaid: 0,
        orders: [],
      },
      100,
      'USD',
    )
    expect(metrics.totalDollarVolume).toBe(90)
  })

  test('sorts by the chosen metric and keeps unavailable results last in either direction', () => {
    const makeMetrics = (percentageReturn: number | null): AnalyticsMetrics => ({
      lastPrice: null,
      highestPrice: null,
      lowestPrice: null,
      averagePrice: null,
      absoluteReturn: null,
      percentageReturn,
      maxDrawdown: null,
      annualizedVolatility: null,
      sharpeRatio: null,
      totalDollarVolume: null,
    })
    const results = [
      { id: 'middle', metrics: makeMetrics(5) },
      { id: 'high', metrics: makeMetrics(12) },
      { id: 'unavailable', metrics: null },
    ]

    expect(sortAnalyticsResults(results, 'percentageReturn', 'descending').map(({ id }) => id))
      .toEqual(['high', 'middle', 'unavailable'])
    expect(sortAnalyticsResults(results, 'percentageReturn', 'ascending').map(({ id }) => id))
      .toEqual(['middle', 'high', 'unavailable'])
  })
})
