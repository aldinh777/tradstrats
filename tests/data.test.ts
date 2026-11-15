import { describe, expect, test } from 'bun:test'
import { calculateAnalyticsMetrics } from '../src/lib/analytics'
import {
  HistoricalDataCache,
  makeCacheKey,
  planMissingRanges,
  type HistoricalDataStore,
} from '../src/lib/data/cache'
import { createFrankfurterProvider } from '../src/lib/data/providers/frankfurter'
import { createHyperliquidProvider } from '../src/lib/data/providers/hyperliquid'
import type { CachedRange, DataProvider, HistoricalRange, MarketInstrument } from '../src/lib/data/types'
import type { Candle } from '../src/lib/strategies/types'

const DAY = 24 * 60 * 60 * 1000
const instrument: MarketInstrument = {
  id: 'frankfurter:USD/EUR',
  providerId: 'frankfurter',
  symbol: 'USD/EUR',
  name: 'United States Dollar to Euro',
  baseCurrency: 'USD',
  quoteCurrency: 'EUR',
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

  async replaceRange(key: string, range: HistoricalRange, fetchedAt: number, candles: Candle[]) {
    const existing = (this.candles.get(key) ?? []).filter(
      (candle) => candle.t < range.startTime || candle.t > range.endTime,
    )
    this.candles.set(key, [...existing, ...candles].sort((a, b) => a.t - b.t))
    this.coverage.set(key, [
      ...(this.coverage.get(key) ?? []).filter(
        (item) => item.startTime !== range.startTime || item.endTime !== range.endTime,
      ),
      { ...range, fetchedAt },
    ])
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
        base: 'USD',
        start_date: '2023-12-29',
        end_date: '2024-01-03',
        rates: {
          '2023-12-29': { EUR: 0.9 },
          '2024-01-02': { EUR: 0.91 },
          '2024-01-03': { EUR: 0.92 },
        },
      }))
    })

    const markets = await provider.listInstruments()
    const pair = markets.find((market) => market.id === 'frankfurter:USD/EUR')
    expect(markets).toHaveLength(2)
    expect(markets.every((market) => market.baseCurrency === 'USD')).toBe(true)
    expect(markets.some((market) => market.id === 'frankfurter:EUR/USD')).toBe(false)
    expect(pair).toBeDefined()
    if (!pair) return

    const candles = await provider.fetchCandles(
      pair,
      '1d',
      Date.UTC(2024, 0, 1),
      Date.UTC(2024, 0, 3, 23, 59, 59, 999),
    )
    expect(candles).toEqual([
      { t: Date.UTC(2024, 0, 2), o: 0.91, h: 0.91, l: 0.91, c: 0.91, v: null },
      { t: Date.UTC(2024, 0, 3), o: 0.92, h: 0.92, l: 0.92, c: 0.92, v: null },
    ])
    expect(new URL(urls[1]).searchParams.get('base')).toBe('USD')
    expect(new URL(urls[1]).searchParams.get('symbols')).toBe('EUR')
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
      'Frankfurter did not list USD as a supported base currency.',
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
  test('reports quote-currency performance while marking unavailable volume and risk as unavailable', () => {
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
    )

    expect(metrics).toMatchObject({
      lastPrice: 2,
      highestPrice: 2,
      lowestPrice: 1,
      averagePrice: 1.5,
      absoluteReturn: 10,
      percentageReturn: 10,
      maxDrawdown: 0,
      totalVolume: null,
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
    )
    expect(metrics.annualizedVolatility).toBeNull()
    expect(metrics.sharpeRatio).toBeNull()
    expect(metrics.totalVolume).toBe(0)
  })
})
