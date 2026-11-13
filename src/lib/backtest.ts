export type Candle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type BacktestResult = {
  equity: number[]
  benchmark: number[]
  totalReturn: number
  benchmarkReturn: number
  maxDrawdown: number
  winRate: number
  trades: number
  finalBalance: number
}

export const STARTING_BALANCE = 10_000
export const DATE_RANGES = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '180 days', days: 180 },
  { label: '1 year', days: 365 },
]

const API_URL = 'https://api.hyperliquid.xyz/info'
const FEE_RATE = 0.0005

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

export async function fetchCandles(
  coin: string,
  interval: string,
  rangeDays: number,
  slowPeriod: number,
): Promise<Candle[]> {
  const endTime = Date.now()
  const startTime = endTime - rangeDays * 24 * 60 * 60 * 1000
  const response = await postInfo({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
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
    .filter((candle) => Number.isFinite(candle.t) && Number.isFinite(candle.c) && candle.c > 0)
    .sort((a, b) => a.t - b.t)

  if (candles.length < slowPeriod + 2) {
    throw new Error(
      `Only ${candles.length} candles were returned. Choose a longer date range or a shorter slow period.`,
    )
  }

  return candles
}

function averageAt(values: number[], end: number, period: number): number {
  let total = 0
  for (let index = end - period + 1; index <= end; index += 1) {
    total += values[index]
  }
  return total / period
}

export function calculateSmaCrossover(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
): BacktestResult {
  const closes = candles.map((candle) => candle.c)
  const equity = [STARTING_BALANCE]
  const benchmark = [STARTING_BALANCE]
  const closedTrades: number[] = []
  let balance = STARTING_BALANCE
  let inPosition = false
  let entryBalance = 0

  for (let index = 1; index < closes.length; index += 1) {
    if (inPosition) {
      balance *= closes[index] / closes[index - 1]
    }

    if (index >= slowPeriod) {
      const fastNow = averageAt(closes, index, fastPeriod)
      const slowNow = averageAt(closes, index, slowPeriod)
      const fastBefore = averageAt(closes, index - 1, fastPeriod)
      const slowBefore = averageAt(closes, index - 1, slowPeriod)

      if (!inPosition && fastBefore <= slowBefore && fastNow > slowNow) {
        balance *= 1 - FEE_RATE
        entryBalance = balance
        inPosition = true
      } else if (inPosition && fastBefore >= slowBefore && fastNow < slowNow) {
        balance *= 1 - FEE_RATE
        closedTrades.push((balance - entryBalance) / entryBalance)
        inPosition = false
      }
    }

    equity.push(balance)
    benchmark.push(STARTING_BALANCE * (closes[index] / closes[0]))
  }

  let peak = equity[0]
  let maxDrawdown = 0
  for (const value of equity) {
    peak = Math.max(peak, value)
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak)
  }

  const wins = closedTrades.filter((trade) => trade > 0).length
  const finalBalance = equity[equity.length - 1]
  const benchmarkBalance = benchmark[benchmark.length - 1]

  return {
    equity,
    benchmark,
    totalReturn: (finalBalance / STARTING_BALANCE - 1) * 100,
    benchmarkReturn: (benchmarkBalance / STARTING_BALANCE - 1) * 100,
    maxDrawdown: maxDrawdown * 100,
    winRate: closedTrades.length ? (wins / closedTrades.length) * 100 : 0,
    trades: closedTrades.length + (inPosition ? 1 : 0),
    finalBalance,
  }
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

export function chartPaths(values: number[], comparison: number[]) {
  if (!values.length) return { strategy: '', benchmark: '', fill: '' }

  const allValues = [...values, ...comparison]
  const low = Math.min(...allValues) * 0.98
  const high = Math.max(...allValues) * 1.02
  const span = high - low || 1
  const pathFor = (series: number[]) =>
    series
      .map((value, index) => {
        const x = 12 + (index / Math.max(series.length - 1, 1)) * 936
        const y = 286 - ((value - low) / span) * 252
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  const strategy = pathFor(values)
  const fill = `${strategy} L948,286 L12,286 Z`
  return { strategy, benchmark: pathFor(comparison), fill }
}

export function chartYLabels(values: number[], comparison: number[]): number[] {
  const allValues = [...values, ...comparison]
  const low = Math.min(...allValues) * 0.98
  const high = Math.max(...allValues) * 1.02
  const step = (high - low) / 3
  return [high, high - step, high - step * 2, low]
}
