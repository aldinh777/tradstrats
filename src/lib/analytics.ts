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
  totalVolume: number | null
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

export function calculateAnalyticsMetrics(
  candles: Candle[],
  result: BacktestResult,
  startingBalance: number,
): AnalyticsMetrics {
  const closes = candles.map(({ c }) => c).filter((value) => Number.isFinite(value) && value > 0)
  const risk = calculateRiskMetrics(result.equity)
  const volumes = candles.flatMap(({ v }) =>
    typeof v === 'number' && Number.isFinite(v) ? [v] : [],
  )

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
    totalVolume: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null,
  }
}
