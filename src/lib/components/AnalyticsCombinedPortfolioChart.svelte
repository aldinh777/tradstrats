<script lang="ts">
  import type { CombinedPortfolioSeries } from '../analytics'

  export let portfolio: CombinedPortfolioSeries
  export let startTime: number
  export let endTime: number

  const portfolioColor = '#b9f277'

  $: values = portfolio.points.map((point) => point.value)
  $: bounds = chartBounds(values)
  $: labels = [
    bounds.high,
    bounds.high - (bounds.high - bounds.low) / 3,
    bounds.low + (bounds.high - bounds.low) / 3,
    bounds.low,
  ]
  $: xDomain = endTime > startTime ? endTime - startTime : 1

  function chartBounds(data: number[]): { low: number; high: number } {
    if (!data.length) return { low: 0, high: 200 }
    let min = 100
    let max = 100
    for (const value of data) {
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    const pad = (max - min || 10) * 0.08
    return { low: min - pad, high: max + pad }
  }

  function pathFor(points: { timestamp: number; value: number }[]): string {
    const span = bounds.high - bounds.low || 1
    return points.map((point, index) => {
      const x = 12 + ((point.timestamp - startTime) / xDomain) * 936
      const y = 286 - ((point.value - bounds.low) / span) * 252
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }
</script>

<section class="chart-card analytics-chart-card combined-portfolio-chart">
  <div class="chart-header">
    <div>
      <h2>Combined token portfolio{#if portfolio.points.length}<span class="chart-title-value">Index {portfolio.points[portfolio.points.length - 1].value.toFixed(2)}</span>{/if}</h2>
      <p>Selected strategy per market · equal initial allocation across {portfolio.marketCount} tokens · no rebalancing.</p>
    </div>
    {#if portfolio.points.length}
      <div class="chart-legend">
        <span><i class="legend-line" style={`background: ${portfolioColor}`}></i>Portfolio · start = 100</span>
      </div>
    {/if}
  </div>
  <div class="chart-body">
    {#if portfolio.points.length}
      <div class="analytics-y-labels">
        {#each labels as label}<span>{label.toFixed(0)}</span>{/each}
      </div>
      <svg
        class="equity-chart"
        viewBox="0 0 960 310"
        preserveAspectRatio="none"
        role="img"
        aria-label="Equal-weighted combined token portfolio performance"
      >
        <path class="grid-line" d="M12 34H948 M12 118H948 M12 202H948 M12 286H948" />
        <path
          d={pathFor(portfolio.points)}
          class="chart-path"
          style={`--strategy-color: ${portfolioColor}; stroke: ${portfolioColor}`}
        />
      </svg>
      <div class="chart-x-labels">
        <span>{new Date(startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>{new Date(startTime + xDomain / 2).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>{new Date(endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
    {:else}
      <div class="chart-empty">Run an analysis with at least one selected token market to view the combined portfolio.</div>
    {/if}
  </div>
</section>
