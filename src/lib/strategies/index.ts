import { buyAndHoldStrategy } from './buyAndHold'
import { constantProportionRebalancingStrategy } from './constantProportionRebalancing'
import { dollarCostAveragingStrategy } from './dollarCostAveraging'
import { fixedQuantityDcaStrategy } from './fixedQuantityDca'
import { nCandleMomentumStrategies } from './nCandleMomentum'
import { valueCostAveragingStrategy } from './valueCostAveraging'
import type { StrategyDefinition, StrategyOption } from './types'

export const STRATEGIES: StrategyDefinition[] = [
  buyAndHoldStrategy,
  dollarCostAveragingStrategy,
  constantProportionRebalancingStrategy,
  valueCostAveragingStrategy,
  fixedQuantityDcaStrategy,
  ...nCandleMomentumStrategies,
]

export const STRATEGY_OPTIONS: StrategyOption[] = STRATEGIES.map(
  ({ id, name, shortName, description, color, category }) => ({
    id,
    name,
    shortName,
    description,
    color,
    category,
  }),
)

export function getStrategy(id: string): StrategyDefinition {
  const strategy = STRATEGIES.find((item) => item.id === id)
  if (!strategy) throw new Error(`Unknown strategy: ${id}`)
  return strategy
}
