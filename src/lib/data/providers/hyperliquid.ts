import type { Candle } from '../../strategies/types'
import type { DataProvider, MarketInstrument, TimeframeOption } from '../types'

const API_URL = 'https://api.hyperliquid.xyz/info'
const DAY = 24 * 60 * 60 * 1000

export const HYPERLIQUID_TIMEFRAMES: readonly TimeframeOption[] = [
  { value: '1d', label: '1 day', apiInterval: '1d' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function postInfo(payload: Record<string, unknown>, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Hyperliquid API returned ${response.status}. Please try again.`)
  }
  return response.json()
}

export function nextCandleTime(timestamp: number, interval: string): number {
  if (interval === '1M') {
    const date = new Date(timestamp)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }
  const step = interval === '12h' ? DAY / 2 : interval === '3d' ? DAY * 3 : interval === '7d' ? DAY * 7 : DAY
  return timestamp + step
}

function toMarketInstrument(coin: string): MarketInstrument {
  return {
    id: `hyperliquid:${coin}`,
    providerId: 'hyperliquid',
    symbol: `${coin}/USD`,
    name: `${coin} perpetual`,
    baseCurrency: coin,
    quoteCurrency: 'USD',
    marketType: 'perpetual',
  }
}

export function createHyperliquidProvider(fetcher: typeof fetch = fetch): DataProvider {
  return {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    description: 'Crypto perpetual-market candles from the public Info API.',
    timeframes: HYPERLIQUID_TIMEFRAMES,
    async listInstruments() {
      const response = await postInfo({ type: 'meta' }, fetcher)
      if (!isRecord(response) || !Array.isArray(response.universe)) {
        throw new Error('Hyperliquid did not return a valid market list.')
      }

      return response.universe.map((market) => {
        if (!isRecord(market) || typeof market.name !== 'string') {
          throw new Error('Hyperliquid did not return a valid market list.')
        }
        return toMarketInstrument(market.name)
      })
    },
    async fetchCandles(instrument, interval, startTime, endTime) {
      const timeframe = HYPERLIQUID_TIMEFRAMES.find((item) => item.value === interval)
      if (!timeframe) throw new Error('Choose a supported Hyperliquid candle timeframe.')
      if (instrument.providerId !== 'hyperliquid') {
        throw new Error('The selected market is not a Hyperliquid instrument.')
      }

      const allCandles: Candle[] = []
      let pageStart = startTime
      while (pageStart <= endTime) {
        const response = await postInfo({
          type: 'candleSnapshot',
          req: {
            coin: instrument.baseCurrency,
            interval: timeframe.apiInterval,
            startTime: pageStart,
            endTime,
          },
        }, fetcher)
        if (!Array.isArray(response)) {
          throw new Error('The Hyperliquid candle response was not in the expected format.')
        }

        const page = response
          .filter(isRecord)
          .map((item) => ({
            t: Number(item.t),
            o: Number(item.o),
            h: Number(item.h),
            l: Number(item.l),
            c: Number(item.c),
            v: Number(item.v),
          }))
          .filter((candle) =>
            Number.isFinite(candle.t) &&
            Number.isFinite(candle.o) && candle.o > 0 &&
            Number.isFinite(candle.h) && candle.h > 0 &&
            Number.isFinite(candle.l) && candle.l > 0 &&
            Number.isFinite(candle.c) && candle.c > 0 &&
            Number.isFinite(candle.v) &&
            candle.t >= startTime &&
            candle.t <= endTime,
          )
          .sort((a, b) => a.t - b.t)

        allCandles.push(...page)
        if (response.length < 500 || !page.length) break

        const nextStart = nextCandleTime(page[page.length - 1].t, interval)
        if (nextStart <= pageStart) break
        pageStart = nextStart
      }

      const uniqueCandles = new Map(allCandles.map((candle) => [candle.t, candle]))
      return [...uniqueCandles.values()].sort((a, b) => a.t - b.t)
    },
  }
}

export const hyperliquidProvider = createHyperliquidProvider()
