<script lang="ts">
  import type { MarketPerformanceSeries } from '../data/types'

  export let series: MarketPerformanceSeries[]
  export let startTime: number
  export let endTime: number
  export let highlightedInstrumentId: string | null

  $: plotted = series.flatMap((item) => {
    const startingEquity = item.result.equity[0]
    if (!startingEquity || item.candles.length === 0) return []
    const observations = item.candles.flatMap((candle, index) => {
      const equity = item.result.equity[index + 1]
      return Number.isFinite(equity)
        ? [{ timestamp: candle.t, value: (equity / startingEquity) * 100 }]
        : []
    })
    const points = observations.length
      ? [{ timestamp: observations[0].timestamp, value: 100 }, ...observations]
      : []
    return points.length ? [{ ...item, points }] : []
  })
  $: values = plotted.flatMap((item) => item.points.map((point) => point.value))
  $: bounds = chartBounds(values)
  $: labels = [bounds.high, bounds.high - (bounds.high - bounds.low) / 3, bounds.low + (bounds.high - bounds.low) / 3, bounds.low]
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

<section class="chart-card analytics-chart-card">
  <div class="chart-header">
    <div>
      <h2>Normalized performance</h2>
      <p>Each selected strategy starts at 100; values are indexed by observation date.</p>
    </div>
    <div class="chart-legend">
      {#each plotted as item}
        <span><i class="legend-line" style={`background: ${item.color}`}></i>{item.instrument.symbol}</span>
      {/each}
    </div>
  </div>
  <div class="chart-body">
    {#if plotted.length}
      <div class="analytics-y-labels">
        {#each labels as label}<span>{label.toFixed(0)}</span>{/each}
      </div>
      <svg class="equity-chart" viewBox="0 0 960 310" preserveAspectRatio="none" role="img" aria-label="Normalized strategy performance by market">
        <path class="grid-line" d="M12 34H948 M12 118H948 M12 202H948 M12 286H948" />
        {#each plotted as item}
          <path
            d={pathFor(item.points)}
            class="chart-path"
            class:chart-path-hovered={highlightedInstrumentId === item.instrument.id}
            class:chart-path-dimmed={highlightedInstrumentId !== null && highlightedInstrumentId !== item.instrument.id}
            style={`--strategy-color: ${item.color}; stroke: ${item.color}`}
          />
        {/each}
      </svg>
      <div class="chart-x-labels">
        <span>{new Date(startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>{new Date(startTime + xDomain / 2).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span>{new Date(endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
    {:else}
      <div class="chart-empty">Run an analysis with selected markets to compare performance.</div>
    {/if}
  </div>
</section>
