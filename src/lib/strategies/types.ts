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
  totalReturn: number
  maxDrawdown: number
  trades: number
  finalBalance: number
  unitsOwned: number
  cashBalance: number
  feesPaid: number
}

export const STRATEGY_CATEGORIES = [
  'Passive Investing',
  'Systematic Investing',
  'Momentum Trading',
] as const

export type StrategyCategory = (typeof STRATEGY_CATEGORIES)[number]

export type StrategyOption = {
  id: string
  name: string
  shortName?: string
  description: string
  color: string
  category: StrategyCategory
}

export type StrategyContext = {
  startingBalance: number
  feeRate: number
}

export type StrategyDefinition = StrategyOption & {
  run: (candles: Candle[], context: StrategyContext) => BacktestResult
}

export type StrategyComparison = {
  strategy: StrategyOption
  result: BacktestResult
}
