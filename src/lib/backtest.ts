import type { Candle } from './strategies/types'
import { hyperliquidProvider, HYPERLIQUID_TIMEFRAMES } from './data/providers/hyperliquid'

export type { BacktestResult, Candle } from './strategies/types'

export const STARTING_BALANCE = 10_000
export const FEE_RATE = 0.0005
export const TIMEFRAMES = HYPERLIQUID_TIMEFRAMES

export async function fetchMarkets(): Promise<string[]> {
  return (await hyperliquidProvider.listInstruments()).map((market) => market.baseCurrency)
}

export function monthStartTimestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Choose a valid start and end month.')

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error('Choose a valid start and end month.')

  return Date.UTC(year, month - 1, 1)
}

export function monthRangeTimestamps(startMonth: string, endMonth: string): {
  startTime: number
  endTime: number
} {
  const startTime = monthStartTimestamp(startMonth)
  const endMonthStart = monthStartTimestamp(endMonth)
  if (startTime > endMonthStart) {
    throw new Error('Start month must be before or equal to end month.')
  }
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number)
  const endExclusive = Date.UTC(endYear, endMonthNumber, 1)
  return { startTime, endTime: Math.min(endExclusive - 1, Date.now()) }
}

export function formatMonthLabel(value: string): string {
  monthStartTimestamp(value)
  return value
}

export function formatMonthRange(startMonth: string, endMonth: string): string {
  return `${formatMonthLabel(startMonth)} – ${formatMonthLabel(endMonth)}`
}

export function formatTimeframeLabel(interval: string): string {
  return TIMEFRAMES.find((timeframe) => timeframe.value === interval)?.label ?? interval
}

export async function fetchCandles(
  coin: string,
  interval: string,
  startMonth: string,
  endMonth: string,
): Promise<Candle[]> {
  const { startTime, endTime } = monthRangeTimestamps(startMonth, endMonth)
  if (startTime > endTime) {
    throw new Error('The selected date range cannot start in the future.')
  }
  const instrument = {
    id: `hyperliquid:${coin}`,
    providerId: 'hyperliquid' as const,
    symbol: `${coin}/USD`,
    name: `${coin} perpetual`,
    baseCurrency: coin,
    quoteCurrency: 'USD',
    marketType: 'perpetual' as const,
  }
  const candles = await hyperliquidProvider.fetchCandles(instrument, interval, startTime, endTime)
  if (candles.length < 2) {
    throw new Error(`Only ${candles.length} candles were returned. Choose a longer date range.`)
  }
  return candles
}

export function formatCurrency(value: number, currency = 'USD'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value < 100 ? 2 : 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number, maximumFractionDigits = 4): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value)
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function formatUnits(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value)
}

export function chartPaths(series: number[][]) {
  if (!series.length || !series[0].length) return { paths: [], fill: '' }

  const allValues = series.flat()
  const low = Math.min(...allValues) * 0.98
  const high = Math.max(...allValues) * 1.02
  const span = high - low || 1
  const pathFor = (values: number[]) =>
    values
      .map((value, index) => {
        const x = 12 + (index / Math.max(values.length - 1, 1)) * 936
        const y = 286 - ((value - low) / span) * 252
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  const paths = series.map(pathFor)
  const fill = `${paths[0]} L948,286 L12,286 Z`
  return { paths, fill }
}

export function chartPoint(
  series: number[][],
  seriesIndex: number,
  pointIndex: number,
): { x: number; y: number } | null {
  const values = series[seriesIndex]
  if (!values || pointIndex < 0 || pointIndex >= values.length) return null

  const allValues = series.flat()
  const low = Math.min(...allValues) * 0.98
  const high = Math.max(...allValues) * 1.02
  return chartPointForRange(values[pointIndex], pointIndex, values.length, low, high)
}

export function chartPointForRange(
  value: number,
  pointIndex: number,
  pointCount: number,
  low: number,
  high: number,
): { x: number; y: number } | null {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(pointIndex) ||
    pointIndex < 0 ||
    !Number.isInteger(pointCount) ||
    pointCount < 1 ||
    pointIndex >= pointCount ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    high < low
  ) {
    return null
  }

  const span = high - low || 1
  return {
    x: 12 + (pointIndex / Math.max(pointCount - 1, 1)) * 936,
    y: 286 - ((value - low) / span) * 252,
  }
}

export function chartYLabels(series: number[][]): number[] {
  const allValues = series.flat()
  const low = Math.min(...allValues) * 0.98
  const high = Math.max(...allValues) * 1.02
  const step = (high - low) / 3
  return [high, high - step, high - step * 2, low]
}
