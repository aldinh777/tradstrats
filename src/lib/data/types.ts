import type { BacktestResult, Candle } from '../strategies/types'

export type ProviderId = 'hyperliquid' | 'frankfurter'
export type WorkspacePage = 'backtest' | 'sources' | 'analytics'

export type MarketInstrument = {
  id: string
  providerId: ProviderId
  symbol: string
  name: string
  baseCurrency: string
  quoteCurrency: string
  marketType: 'perpetual' | 'forex'
}

export type TimeframeOption = {
  value: string
  label: string
  apiInterval: string
}

export type DataProvider = {
  id: ProviderId
  name: string
  description: string
  timeframes: readonly TimeframeOption[]
  listInstruments: () => Promise<MarketInstrument[]>
  fetchCandles: (
    instrument: MarketInstrument,
    interval: string,
    startTime: number,
    endTime: number,
  ) => Promise<Candle[]>
}

export type ProviderCatalog = {
  provider: DataProvider
  instruments: MarketInstrument[]
  error: string
}

export type HistoricalRange = {
  startTime: number
  endTime: number
}

export type MarketPerformanceSeries = {
  instrument: MarketInstrument
  candles: Candle[]
  result: BacktestResult
  color: string
}

export type CachedRange = HistoricalRange & {
  fetchedAt: number
}

export type CachedSeriesSummary = {
  key: string
  providerId: ProviderId
  instrumentId: string
  interval: string
  candleCount: number
  firstTimestamp: number | null
  lastTimestamp: number | null
  coverage: CachedRange[]
}
