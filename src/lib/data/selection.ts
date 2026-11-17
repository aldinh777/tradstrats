import type { MarketInstrument } from './types'

const SELECTIONS_KEY = 'tradstrats.selected-instruments.v1'
const BACKTEST_INSTRUMENT_KEY = 'tradstrats.backtest-instrument.v1'
const ANALYTICS_INSTRUMENTS_KEY = 'tradstrats.analytics-instruments.v1'

function isMarketInstrument(value: unknown): value is MarketInstrument {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' &&
    (item.providerId === 'hyperliquid' || item.providerId === 'frankfurter') &&
    typeof item.symbol === 'string' &&
    typeof item.name === 'string' &&
    typeof item.baseCurrency === 'string' &&
    typeof item.quoteCurrency === 'string' &&
    (item.marketType === 'perpetual' || item.marketType === 'forex')
}

export function loadInstrumentSelections(): { exists: boolean; instruments: MarketInstrument[] } {
  const stored = localStorage.getItem(SELECTIONS_KEY)
  if (stored === null) return { exists: false, instruments: [] }
  const parsed: unknown = JSON.parse(stored)
  if (!Array.isArray(parsed) || !parsed.every(isMarketInstrument)) {
    throw new Error('Saved market selections are invalid. Clear them in Data Source and select markets again.')
  }
  return { exists: true, instruments: parsed }
}

export function saveInstrumentSelections(instruments: MarketInstrument[]): void {
  localStorage.setItem(SELECTIONS_KEY, JSON.stringify(instruments))
}

export function loadBacktestInstrumentId(): string | null {
  return localStorage.getItem(BACKTEST_INSTRUMENT_KEY)
}

export function saveBacktestInstrumentId(id: string): void {
  localStorage.setItem(BACKTEST_INSTRUMENT_KEY, id)
}

export function loadAnalyticsSelections(): { exists: boolean; ids: string[] } {
  const stored = localStorage.getItem(ANALYTICS_INSTRUMENTS_KEY)
  if (stored === null) return { exists: false, ids: [] }
  const parsed: unknown = JSON.parse(stored)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Saved analytics selections are invalid. Update the market selection and try again.')
  }
  return { exists: true, ids: parsed }
}

export function saveAnalyticsInstrumentIds(ids: string[]): void {
  localStorage.setItem(ANALYTICS_INSTRUMENTS_KEY, JSON.stringify(ids))
}
