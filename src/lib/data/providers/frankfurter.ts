import type { Candle } from '../../strategies/types'
import type { DataProvider, MarketInstrument, TimeframeOption } from '../types'

const API_URL = 'https://api.frankfurter.dev/v1'

export const FRANKFURTER_TIMEFRAMES: readonly TimeframeOption[] = [
  { value: '1d', label: 'Daily reference rate', apiInterval: '1d' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseDate(date: string): number {
  const timestamp = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(timestamp)) throw new Error('Frankfurter returned an invalid observation date.')
  return timestamp
}

export function createFrankfurterProvider(fetcher: typeof fetch = fetch): DataProvider {
  return {
    id: 'frankfurter',
    name: 'Frankfurter',
    description: 'ECB daily reference rates for currency/USD pairs.',
    timeframes: FRANKFURTER_TIMEFRAMES,
    async listInstruments() {
      const response = await fetcher(`${API_URL}/currencies`)
      if (!response.ok) throw new Error(`Frankfurter API returned ${response.status}. Please try again.`)
      const data: unknown = await response.json()
      if (!isRecord(data)) throw new Error('Frankfurter did not return a valid currency list.')

      const currencies = Object.entries(data).filter(
        ([code, name]) =>
          /^[A-Z]{3}$/.test(code) &&
          typeof name === 'string',
      )
      if (!currencies.length) throw new Error('Frankfurter returned no supported currencies.')

      const usd = currencies.find(([code]) => code === 'USD')
      if (!usd) throw new Error('Frankfurter did not list USD as a supported quote currency.')
      const [, quoteName] = usd

      return currencies
        .filter(([baseCurrency]) => baseCurrency !== 'USD')
        .map(([baseCurrency, baseName]) => ({
          id: `frankfurter:${baseCurrency}/USD`,
          providerId: 'frankfurter' as const,
          symbol: `${baseCurrency}/USD`,
          name: `${baseName} to ${quoteName}`,
          baseCurrency,
          quoteCurrency: 'USD',
          marketType: 'forex' as const,
        }))
    },
    async fetchCandles(instrument, interval, startTime, endTime) {
      if (interval !== '1d') throw new Error('Frankfurter provides daily reference rates only.')
      if (instrument.providerId !== 'frankfurter') {
        throw new Error('The selected market is not a Frankfurter currency pair.')
      }

      const start = new Date(startTime).toISOString().slice(0, 10)
      const end = new Date(endTime).toISOString().slice(0, 10)
      const url = new URL(`${API_URL}/${start}..${end}`)
      url.searchParams.set('base', instrument.baseCurrency)
      url.searchParams.set('symbols', instrument.quoteCurrency)
      const response = await fetcher(url)
      if (!response.ok) {
        throw new Error(`Frankfurter API returned ${response.status}. Check the pair and date range.`)
      }

      const data: unknown = await response.json()
      if (!isRecord(data) || !isRecord(data.rates)) {
        throw new Error('Frankfurter returned historical data in an unexpected format.')
      }

      return Object.entries(data.rates)
        .flatMap(([date, rates]) => {
          if (!isRecord(rates)) return []
          const value = Number(rates[instrument.quoteCurrency])
          const timestamp = parseDate(date)
          if (!Number.isFinite(value) || value <= 0 || timestamp < startTime || timestamp > endTime) {
            return []
          }
          return [{ t: timestamp, o: value, h: value, l: value, c: value, v: null }]
        })
        .sort((a, b) => a.t - b.t)
    },
  }
}

export const frankfurterProvider = createFrankfurterProvider()
