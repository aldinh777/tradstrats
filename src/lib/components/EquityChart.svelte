<script lang="ts">
  import {
    chartPaths,
    chartYLabels,
    formatCurrency,
    STARTING_BALANCE,
    type Candle,
  } from '../backtest'
  import type { StrategyComparison } from '../strategies/types'

  export let comparisons: StrategyComparison[]
  export let candles: Candle[]
  export let loading: boolean
  export let highlightedStrategyId: string | null
  export let currency: string

  $: series = comparisons.map((comparison) => comparison.result.equity)
  $: paths = chartPaths(series)
  $: yLabels = chartYLabels(series)
</script>

<section class="chart-card">
  <div class="chart-header">
    <div>
      <h2>Equity curve</h2>
      <p>Portfolio value over time · starting balance {formatCurrency(STARTING_BALANCE, currency)}</p>
    </div>
    <div class="chart-legend">
      {#each comparisons as comparison}
        <span>
          <i class="legend-line" style={`background: ${comparison.strategy.color}`}></i>
          {comparison.strategy.shortName ?? comparison.strategy.name}
        </span>
      {/each}
    </div>
  </div>
  <div class="chart-body">
    {#if loading && !comparisons.length}
      <div class="chart-loading"><span class="spinner"></span> Fetching historical market data…</div>
    {:else if comparisons.length && candles.length}
      <div class="chart-y-labels">{#each yLabels as label}<span>{formatCurrency(label, currency)}</span>{/each}</div>
      <svg class="equity-chart" viewBox="0 0 960 310" preserveAspectRatio="none" role="img" aria-label="Equity curves for selected strategies">
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color={comparisons[0].strategy.color} stop-opacity=".16" />
            <stop offset="100%" stop-color={comparisons[0].strategy.color} stop-opacity="0" />
          </linearGradient>
        </defs>
        <path class="grid-line" d="M12 34H948 M12 118H948 M12 202H948 M12 286H948" />
        <path d={paths.fill} fill="url(#area-fill)" />
        {#each comparisons as comparison, index}
          <path
            d={paths.paths[index]}
            class="chart-path"
            class:chart-path-hovered={highlightedStrategyId === comparison.strategy.id}
            class:chart-path-dimmed={highlightedStrategyId !== null && highlightedStrategyId !== comparison.strategy.id}
            style={`--strategy-color: ${comparison.strategy.color}; stroke: ${comparison.strategy.color}`}
          />
        {/each}
      </svg>
      <div class="chart-x-labels">
        <span>{new Date(candles[0].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(candles[Math.floor(candles.length / 2)].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(candles[candles.length - 1].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    {:else}
      <div class="chart-empty">Run a backtest to see your strategy performance.</div>
    {/if}
  </div>
  {#if comparisons.length}
    <div class="chart-footer">
      <div><span class="footer-label">STARTING BALANCE</span><strong>{formatCurrency(STARTING_BALANCE, currency)}</strong></div>
      <div><span class="footer-label">CANDLES ANALYZED</span><strong>{candles.length.toLocaleString()}</strong></div>
      <div class="chart-footer-note">Past performance does not guarantee future results.</div>
    </div>
  {/if}
</section>
