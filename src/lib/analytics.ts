import type { MarketPerformanceSeries } from './data/types'
import type { Candle, BacktestResult } from './strategies/types'

export type AnalyticsMetrics = {
  lastPrice: number | null
  highestPrice: number | null
  lowestPrice: number | null
  averagePrice: number | null
  absoluteReturn: number | null
  percentageReturn: number | null
  maxDrawdown: number | null
  annualizedVolatility: number | null
  sharpeRatio: number | null
  totalDollarVolume: number | null
}

export type AnalyticsSortMetric =
  | 'percentageReturn'
  | 'annualizedVolatility'
  | 'maxDrawdown'
  | 'sharpeRatio'
export type AnalyticsSortDirection = 'ascending' | 'descending'
export type CombinedPortfolioSeries = {
  points: { timestamp: number; value: number }[]
  marketCount: number
}
export type CombinedPortfolioMetrics = {
  currentIndex: number | null
  highestIndex: number | null
  lowestIndex: number | null
  averageIndex: number | null
  currentValue: number | null
  highestValue: number | null
  lowestValue: number | null
  averageValue: number | null
  absoluteReturn: number | null
  percentageReturn: number | null
  maxDrawdown: number | null
  annualizedVolatility: number | null
  sharpeRatio: number | null
  totalDollarVolume: number | null
}

export function combineTokenPerformanceSeries(
  series: readonly MarketPerformanceSeries[],
): CombinedPortfolioSeries {
  const tokens = series.filter((item) =>
    item.instrument.marketType === 'perpetual' &&
    item.candles.length > 0 &&
    item.result.equity.length > item.candles.length &&
    item.result.equity[0] > 0,
  )
  if (!tokens.length) return { points: [], marketCount: 0 }

  const timestamps = [...new Set(tokens.flatMap((item) => item.candles.map(({ t }) => t)))]
    .sort((a, b) => a - b)
  const currentValues = tokens.map(() => 100)
  const candleIndexes = tokens.map(() => 0)
  const points = [{ timestamp: timestamps[0], value: 100 }]

  for (const timestamp of timestamps) {
    tokens.forEach((item, tokenIndex) => {
      let candleIndex = candleIndexes[tokenIndex]
      while (candleIndex < item.candles.length && item.candles[candleIndex].t <= timestamp) {
        const equity = item.result.equity[candleIndex + 1]
        if (Number.isFinite(equity)) {
          currentValues[tokenIndex] = (equity / item.result.equity[0]) * 100
        }
        candleIndex += 1
      }
      candleIndexes[tokenIndex] = candleIndex
    })
    points.push({
      timestamp,
      value: currentValues.reduce((sum, value) => sum + value, 0) / tokens.length,
    })
  }

  return { points, marketCount: tokens.length }
}

function calculateRiskMetrics(equity: number[]): {
  annualizedVolatility: number | null
  sharpeRatio: number | null
} {
  const returns = equity.slice(1).flatMap((value, index) => {
    const previous = equity[index]
    return Number.isFinite(value) && Number.isFinite(previous) && previous > 0
      ? [value / previous - 1]
      : []
  })
  if (returns.length < 2) return { annualizedVolatility: null, sharpeRatio: null }

  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (returns.length - 1)
  const dailyVolatility = Math.sqrt(variance)
  if (!Number.isFinite(dailyVolatility) || dailyVolatility === 0) {
    return {
      annualizedVolatility: dailyVolatility === 0 ? 0 : null,
      sharpeRatio: null,
    }
  }
  return {
    annualizedVolatility: dailyVolatility * Math.sqrt(252) * 100,
    sharpeRatio: (average / dailyVolatility) * Math.sqrt(252),
  }
}

function calculateMaximumDrawdown(values: number[]): number | null {
  if (!values.length) return null

  let peak = values[0]
  let maxDrawdown = 0
  for (const value of values) {
    peak = Math.max(peak, value)
    maxDrawdown = Math.max(maxDrawdown, ((peak - value) / peak) * 100)
  }
  return maxDrawdown
}

export function calculateCombinedPortfolioMetrics(
  portfolio: CombinedPortfolioSeries,
  startingBalance: number,
  totalDollarVolume: number | null = null,
): CombinedPortfolioMetrics {
  const indexes = portfolio.points
    .map(({ value }) => value)
    .filter((value) => Number.isFinite(value) && value > 0)
  const values = indexes.map((value) => (value / 100) * startingBalance)
  const currentIndex = indexes.at(-1) ?? null
  const currentValue = values.at(-1) ?? null
  const risk = calculateRiskMetrics(indexes)

  return {
    currentIndex,
    highestIndex: indexes.length ? Math.max(...indexes) : null,
    lowestIndex: indexes.length ? Math.min(...indexes) : null,
    averageIndex: indexes.length
      ? indexes.reduce((sum, value) => sum + value, 0) / indexes.length
      : null,
    currentValue,
    highestValue: values.length ? Math.max(...values) : null,
    lowestValue: values.length ? Math.min(...values) : null,
    averageValue: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    absoluteReturn: currentValue === null ? null : currentValue - startingBalance,
    percentageReturn: currentIndex === null ? null : (currentIndex / 100 - 1) * 100,
    maxDrawdown: calculateMaximumDrawdown(indexes),
    ...risk,
    totalDollarVolume,
  }
}

export function calculateAnalyticsMetrics(
  candles: Candle[],
  result: BacktestResult,
  startingBalance: number,
  quoteCurrency: string,
): AnalyticsMetrics {
  const closes = candles.map(({ c }) => c).filter((value) => Number.isFinite(value) && value > 0)
  const risk = calculateRiskMetrics(result.equity)
  const dollarVolumes = quoteCurrency === 'USD'
    ? candles.flatMap(({ v, c }) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isFinite(c) && c > 0
        ? [v * c]
        : [],
    )
    : []

  return {
    lastPrice: closes.length ? closes[closes.length - 1] : null,
    highestPrice: closes.length ? Math.max(...closes) : null,
    lowestPrice: closes.length ? Math.min(...closes) : null,
    averagePrice: closes.length
      ? closes.reduce((sum, value) => sum + value, 0) / closes.length
      : null,
    absoluteReturn: Number.isFinite(result.finalBalance) ? result.finalBalance - startingBalance : null,
    percentageReturn: Number.isFinite(result.totalReturn) ? result.totalReturn : null,
    maxDrawdown: Number.isFinite(result.maxDrawdown) ? result.maxDrawdown : null,
    ...risk,
    totalDollarVolume: dollarVolumes.length
      ? dollarVolumes.reduce((sum, value) => sum + value, 0)
      : null,
  }
}

export function sortAnalyticsResults<T extends { metrics: AnalyticsMetrics | null }>(
  items: readonly T[],
  metric: AnalyticsSortMetric,
  direction: AnalyticsSortDirection,
): T[] {
  const multiplier = direction === 'ascending' ? 1 : -1
  return items
    .map((item, index) => ({ item, index, value: item.metrics?.[metric] ?? null }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index
      if (a.value === null) return 1
      if (b.value === null) return -1
      return (a.value - b.value) * multiplier || a.index - b.index
    })
    .map(({ item }) => item)
}
