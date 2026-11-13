import { buyAndHoldStrategy } from './buyAndHold'
import { delayedTrendFollowingStrategy } from './delayedTrendFollowing'
import { dcaStrategy } from './dca'
import { trendFollowingStrategy } from './trendFollowing'
import { valueCostAveragingStrategy } from './valueCostAveraging'
import type { StrategyDefinition, StrategyOption } from './types'

export const STRATEGIES: StrategyDefinition[] = [
  buyAndHoldStrategy,
  dcaStrategy,
  trendFollowingStrategy,
  delayedTrendFollowingStrategy,
  valueCostAveragingStrategy,
]

export const STRATEGY_OPTIONS: StrategyOption[] = STRATEGIES.map(
  ({ id, name, description, color }) => ({ id, name, description, color }),
)

export function getStrategy(id: string): StrategyDefinition {
  const strategy = STRATEGIES.find((item) => item.id === id)
  if (!strategy) throw new Error(`Unknown strategy: ${id}`)
  return strategy
}
