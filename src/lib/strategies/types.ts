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

export type StrategyOption = {
  id: string
  name: string
  description: string
  color: string
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
