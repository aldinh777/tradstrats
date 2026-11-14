export type Candle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type TradeOrder = {
  timestamp: number
  side: 'buy' | 'sell'
  price: number
  quantity: number
  notional: number
  fee: number
}

export type IdentifiedTradeOrder = TradeOrder & {
  strategyId: string
}

export const MIN_ORDER_NOTIONAL = 10

export type BacktestResult = {
  equity: number[]
  totalReturn: number
  maxDrawdown: number
  trades: number
  finalBalance: number
  unitsOwned: number
  cashBalance: number
  feesPaid: number
  orders: TradeOrder[]
}

export const STRATEGY_CATEGORIES = [
  'Passive Investing',
  'Systematic Investing',
  'Candle Momentum',
  'Technical Analysis',
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
