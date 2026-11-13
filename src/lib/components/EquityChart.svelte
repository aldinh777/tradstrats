<script lang="ts">
  import {
    chartPaths,
    chartPoint,
    chartYLabels,
    formatCurrency,
    formatUnits,
    STARTING_BALANCE,
    type Candle,
  } from '../backtest'
  import type { StrategyComparison, TradeOrder } from '../strategies/types'

  export let comparisons: StrategyComparison[]
  export let candles: Candle[]
  export let loading: boolean
  export let highlightedStrategyId: string | null

  $: series = comparisons.map((comparison) => comparison.result.equity)
  $: paths = chartPaths(series)
  $: yLabels = chartYLabels(series)
  $: highlightedComparison = comparisons.find(
    (comparison) => comparison.strategy.id === highlightedStrategyId,
  )
  $: highlightedSeriesIndex = comparisons.findIndex(
    (comparison) => comparison.strategy.id === highlightedStrategyId,
  )
  $: tradeMarkers = getTradeMarkers(
    highlightedComparison,
    highlightedSeriesIndex,
    candles,
    series,
  )
  let hoveredTradeOrder: PositionedTradeOrder | null = null
  let tooltipElement: HTMLDivElement

  type PositionedTradeOrder = TradeOrder & { x: number; y: number }

  function handleMarkerLeave(event: MouseEvent) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && tooltipElement?.contains(nextTarget)) return
    hoveredTradeOrder = null
  }

  function getTradeMarkers(
    comparison: StrategyComparison | undefined,
    seriesIndex: number,
    chartCandles: Candle[],
    chartSeries: number[][],
  ): PositionedTradeOrder[] {
    if (!comparison || seriesIndex < 0) return []

    const candleIndices = new Map(chartCandles.map((candle, index) => [candle.t, index]))
    return comparison.result.orders.flatMap((order) => {
      const candleIndex = candleIndices.get(order.timestamp)
      if (candleIndex === undefined) return []
      const point = chartPoint(chartSeries, seriesIndex, candleIndex)
      return point ? [{ ...order, ...point }] : []
    })
  }
</script>

<section class="chart-card">
  <div class="chart-header">
    <div>
      <h2>Equity curve</h2>
      <p>Portfolio value over time · starting balance {formatCurrency(STARTING_BALANCE)}</p>
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
      <div class="chart-loading"><span class="spinner"></span> Fetching historical candles from Hyperliquid…</div>
    {:else if comparisons.length && candles.length}
      <div class="chart-y-labels">{#each yLabels as label}<span>{formatCurrency(label)}</span>{/each}</div>
      <div
        class="equity-chart-wrap"
        role="presentation"
        on:mouseleave={() => (hoveredTradeOrder = null)}
      >
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
        {#each tradeMarkers as marker}
          <g
            class="trade-marker"
            class:trade-marker-buy={marker.side === 'buy'}
            class:trade-marker-sell={marker.side === 'sell'}
            transform={`translate(${marker.x} ${marker.y})`}
            role="img"
            aria-label={`${marker.side} order at ${new Date(marker.timestamp).toLocaleString()}`}
            on:mouseenter={() => (hoveredTradeOrder = marker)}
            on:mouseleave={handleMarkerLeave}
          >
            <circle r="6"></circle>
            <text y="1.8">{marker.side === 'buy' ? 'B' : 'S'}</text>
          </g>
        {/each}
      </svg>
      {#if hoveredTradeOrder}
        <div
          class="trade-tooltip"
          role="tooltip"
          bind:this={tooltipElement}
          class:trade-tooltip-below={hoveredTradeOrder.y < 115}
          class:trade-tooltip-buy={hoveredTradeOrder.side === 'buy'}
          style={`left: clamp(112px, ${(hoveredTradeOrder.x / 960) * 100}%, calc(100% - 112px)); top: ${(hoveredTradeOrder.y / 310) * 100}%`}
          on:mouseleave={() => (hoveredTradeOrder = null)}
        >
          <strong>{hoveredTradeOrder.side.toUpperCase()} · {new Date(hoveredTradeOrder.timestamp).toLocaleString()}</strong>
          <span>Price <b>{formatCurrency(hoveredTradeOrder.price)}</b></span>
          <span>Quantity <b>{formatUnits(hoveredTradeOrder.quantity)}</b></span>
          <span>Notional <b>{formatCurrency(hoveredTradeOrder.notional)}</b></span>
          <span>Fee <b>{formatCurrency(hoveredTradeOrder.fee)}</b></span>
        </div>
      {/if}
      </div>
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
      <div><span class="footer-label">STARTING BALANCE</span><strong>{formatCurrency(STARTING_BALANCE)}</strong></div>
      <div><span class="footer-label">CANDLES ANALYZED</span><strong>{candles.length.toLocaleString()}</strong></div>
      <div class="chart-footer-note">Past performance does not guarantee future results.</div>
    </div>
  {/if}
</section>
