import type { Candle } from './strategies/types'

export type { BacktestResult, Candle } from './strategies/types'

export const STARTING_BALANCE = 10_000
export const FEE_RATE = 0.0005
export const TIMEFRAMES = [
  { value: '12h', label: '12 hours', apiInterval: '12h' },
  { value: '1d', label: '1 day', apiInterval: '1d' },
  { value: '3d', label: '3 days', apiInterval: '3d' },
  { value: '7d', label: '7 days', apiInterval: '1w' },
  { value: '1M', label: '1 month', apiInterval: '1M' },
] as const

const API_URL = 'https://api.hyperliquid.xyz/info'

async function postInfo(payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Hyperliquid API returned ${response.status}. Please try again.`)
  }

  return response.json()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function fetchMarkets(): Promise<string[]> {
  const response = await postInfo({ type: 'meta' })
  if (!isRecord(response) || !Array.isArray(response.universe)) {
    throw new Error('Hyperliquid did not return a valid market list.')
  }

  const markets: string[] = []
  for (const market of response.universe) {
    if (!isRecord(market) || typeof market.name !== 'string') {
      throw new Error('Hyperliquid did not return a valid market list.')
    }
    markets.push(market.name)
  }
  return markets
}

function monthStartTimestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Choose a valid start and end month.')

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error('Choose a valid start and end month.')

  return Date.UTC(year, month - 1, 1)
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
  const timeframe = TIMEFRAMES.find((item) => item.value === interval)
  if (!timeframe) throw new Error('Choose a supported candle timeframe.')

  const startTime = monthStartTimestamp(startMonth)
  const endMonthStart = monthStartTimestamp(endMonth)
  if (startTime > endMonthStart) {
    throw new Error('Start month must be before or equal to end month.')
  }

  const [endYear, endMonthNumber] = endMonth.split('-').map(Number)
  const endExclusive = Date.UTC(endYear, endMonthNumber, 1)
  const endTime = Math.min(endExclusive - 1, Date.now())
  if (startTime > endTime) {
    throw new Error('The selected date range cannot start in the future.')
  }

  const response = await postInfo({
    type: 'candleSnapshot',
    req: { coin, interval: timeframe.apiInterval, startTime, endTime },
  })

  if (!Array.isArray(response)) {
    throw new Error('The market data response was not in the expected format.')
  }

  const candles: Candle[] = response
    .filter(isRecord)
    .map((item) => ({
      t: Number(item.t),
      o: Number(item.o),
      h: Number(item.h),
      l: Number(item.l),
      c: Number(item.c),
      v: Number(item.v),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.t) &&
        Number.isFinite(candle.o) &&
        candle.o > 0 &&
        Number.isFinite(candle.c) &&
        candle.c > 0,
    )
    .sort((a, b) => a.t - b.t)

  if (candles.length < 2) {
    throw new Error(`Only ${candles.length} candles were returned. Choose a longer date range.`)
  }

  return candles
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 100 ? 2 : 0,
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
