<script lang="ts">
  import { formatCurrency, formatPercent, formatUnits } from '../backtest'
  import type { StrategyComparison } from '../strategies/types'

  export let comparisons: StrategyComparison[]
  export let loading: boolean
  export let periodLabel: string
  export let quoteCurrency: string
  export let hoveredStrategyId: string | null
  export let activeStrategyId: string | null
  export let onHover: (strategyId: string | null) => void
  export let onToggleActive: (strategyId: string) => void
</script>

<section class="comparison-grid" aria-label="Strategy comparison results">
  {#if comparisons.length}
    {#each comparisons as comparison}
      <article
        class="comparison-card"
        class:comparison-card-hovered={hoveredStrategyId === comparison.strategy.id}
        class:comparison-card-active={activeStrategyId === comparison.strategy.id}
        style={`--strategy-color: ${comparison.strategy.color}`}
        on:mouseenter={() => onHover(comparison.strategy.id)}
        on:mouseleave={() => onHover(null)}
      >
        <button
          class="comparison-card-toggle"
          type="button"
          aria-label={`Toggle chart focus for ${comparison.strategy.name}`}
          aria-pressed={activeStrategyId === comparison.strategy.id}
          on:click={() => onToggleActive(comparison.strategy.id)}
        ></button>
        <div class="comparison-card-heading">
          <span class="comparison-dot" style={`--strategy-color: ${comparison.strategy.color}`}></span>
          <strong>{comparison.strategy.name}</strong>
          <span class="comparison-period">{periodLabel}</span>
        </div>
        <p class="comparison-description">{comparison.strategy.description}</p>
        <div class="comparison-return" class:positive={comparison.result.totalReturn >= 0} class:negative={comparison.result.totalReturn < 0}>
          {formatPercent(comparison.result.totalReturn)}
          <span>return</span>
        </div>
        <div class="comparison-stats">
          <div><span>MAX DRAWDOWN</span><strong>{comparison.result.maxDrawdown.toFixed(2)}%</strong></div>
          <div><span>ORDERS</span><strong>{comparison.result.trades}</strong></div>
          <div><span>ENDING BALANCE</span><strong>{formatCurrency(comparison.result.finalBalance, quoteCurrency)}</strong></div>
          <div><span>UNITS OWNED</span><strong>{formatUnits(comparison.result.unitsOwned)}</strong></div>
          <div><span>CASH LEFT</span><strong>{formatCurrency(comparison.result.cashBalance, quoteCurrency)}</strong></div>
          <div><span>FEES PAID</span><strong>{formatCurrency(comparison.result.feesPaid, quoteCurrency)}</strong></div>
        </div>
      </article>
    {/each}
  {:else}
    <div class="comparison-empty">
      {#if loading}Loading strategy results…{:else}Choose one or more strategies and run the comparison.{/if}
    </div>
  {/if}
</section>
