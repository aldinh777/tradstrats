<script lang="ts">
  import {
    chartPointForRange,
    formatCurrency,
    formatNumber,
    formatUnits,
    type Candle,
  } from '../backtest'
  import type { MarketInstrument } from '../data/types'
  import { buyAndHoldStrategy } from '../strategies/buyAndHold'
  import type { IdentifiedTradeOrder, StrategyComparison } from '../strategies/types'

  export let instrument: MarketInstrument
  export let interval: string
  export let comparisons: StrategyComparison[]
  export let candles: Candle[]
  export let loading: boolean
  export let highlightedStrategyId: string | null
  export let hoveredOrder: IdentifiedTradeOrder | null
  export let onHoverOrder: (order: IdentifiedTradeOrder | null) => void
  export let showOrderMarkers = true
  export let headlineValue: string | null = null

  type PositionedTradeOrder = IdentifiedTradeOrder & { x: number; y: number }

  let chartType: 'line' | 'candles' = 'candles'
  let displayedInstrumentId = ''
  let tooltipElement: HTMLDivElement

  $: if (instrument.id !== displayedInstrumentId) {
    chartType = instrument.marketType === 'forex' ? 'line' : 'candles'
    displayedInstrumentId = instrument.id
  }
  $: hoveredTradeOrder = hoveredOrder
    ? tradeMarkers.find((marker) => isSameOrder(marker, hoveredOrder)) ?? null
    : null
  $: focusedStrategyId = highlightedStrategyId ?? comparisons[0]?.strategy.id ?? null
  $: focusedComparison = comparisons.find(
    (comparison) => comparison.strategy.id === focusedStrategyId,
  )
  $: priceFormatter = (value: number) => instrument.marketType === 'forex'
    ? `${formatNumber(value, 5)} ${instrument.quoteCurrency}`
    : formatCurrency(value, instrument.quoteCurrency)
  $: priceBounds = getPriceBounds(candles)
  $: pricePath = getPricePath(candles, priceBounds.low, priceBounds.high)
  $: yLabels = getPriceYLabels(priceBounds.low, priceBounds.high)
  $: lastCandleCloseTimestamp = getLastCandleCloseTimestamp(candles, interval)
  $: tradeMarkers = getTradeMarkers(
    focusedComparison,
    candles,
    priceBounds.low,
    priceBounds.high,
    chartType,
  )

  function isSameOrder(first: IdentifiedTradeOrder, second: IdentifiedTradeOrder): boolean {
    return first.strategyId === second.strategyId &&
      first.timestamp === second.timestamp &&
      first.side === second.side &&
      first.price === second.price
  }

  function getPriceBounds(chartCandles: Candle[]): { low: number; high: number } {
    if (!chartCandles.length) return { low: 0, high: 1 }

    const candleBounds = chartCandles.reduce(
      (bounds, candle) => ({
        low: Math.min(bounds.low, candle.l),
        high: Math.max(bounds.high, candle.h),
      }),
      { low: Infinity, high: -Infinity },
    )
    const padding = (candleBounds.high - candleBounds.low || candleBounds.high * 0.04 || 1) * 0.02
    return { low: candleBounds.low - padding, high: candleBounds.high + padding }
  }

  function getPricePath(chartCandles: Candle[], low: number, high: number): string {
    return chartCandles
      .flatMap((candle, index) => [
        { value: candle.o, index },
        { value: candle.c, index: index + 1 },
      ])
      .map(({ value, index }, pointIndex) => {
        const point = chartPointForRange(value, index, chartCandles.length + 1, low, high)
        return point
          ? `${pointIndex === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
          : ''
      })
      .filter((point) => point.length > 0)
      .join(' ')
  }

  function getPriceY(value: number, low: number, high: number): number {
    return 286 - ((value - low) / (high - low || 1)) * 252
  }

  function getLastCandleCloseTimestamp(chartCandles: Candle[], chartInterval: string): number {
    if (!chartCandles.length) return 0

    const lastTimestamp = chartCandles[chartCandles.length - 1].t
    if (chartInterval === '1M') {
      const lastDate = new Date(lastTimestamp)
      return Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, 1)
    }

    const intervalMilliseconds: Record<string, number> = {
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }
    return lastTimestamp + (intervalMilliseconds[chartInterval] ?? 0)
  }

  function getPriceYLabels(low: number, high: number): number[] {
    const step = (high - low) / 3
    return [high, high - step, high - step * 2, low]
  }

  function getTradeMarkers(
    comparison: StrategyComparison | undefined,
    chartCandles: Candle[],
    low: number,
    high: number,
    displayType: 'line' | 'candles',
  ): PositionedTradeOrder[] {
    if (!comparison || !chartCandles.length) return []

    const candleIndices = new Map(chartCandles.map((candle, index) => [candle.t, index]))
    return comparison.result.orders.flatMap((order) => {
      const candleIndex = candleIndices.get(order.timestamp)
      if (candleIndex === undefined) return []
      const markerIndex = displayType === 'candles' ? candleIndex + 0.5 : candleIndex
      const point = chartPointForRange(
        displayType === 'candles' ? chartCandles[candleIndex].h : order.price,
        markerIndex,
        chartCandles.length + 1,
        low,
        high,
      )
      return point
        ? [{
            ...order,
            ...point,
            strategyId: comparison.strategy.id,
            y: point.y - (displayType === 'candles' ? 12 : 0),
          }]
        : []
    })
  }

  function handleMarkerLeave(event: MouseEvent) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && tooltipElement?.contains(nextTarget)) return
    onHoverOrder(null)
  }
</script>

<section class="chart-card">
  <div class="chart-header">
    <div>
      <h2>{instrument.symbol} price{#if headlineValue}<span class="chart-title-value">{headlineValue}</span>{/if}</h2>
      <p>{instrument.marketType === 'forex' ? 'Daily reference observations (flat OHLC) · no volume supplied' : 'Candle open and close prices'}{showOrderMarkers ? ' · order markers for the focused strategy' : ''}</p>
    </div>
    {#if focusedComparison}
      <div class="chart-legend">
        <span>
          <i class="legend-line" style={`background: ${focusedComparison.strategy.color}`}></i>
          {focusedComparison.strategy.shortName ?? focusedComparison.strategy.name}
        </span>
      </div>
    {/if}
    <div class="chart-display-toggle" role="group" aria-label="Price chart type">
      <button
        type="button"
        aria-pressed={chartType === 'line'}
        on:click={() => (chartType = 'line')}
      >Line</button>
      <button
        type="button"
        aria-pressed={chartType === 'candles'}
        on:click={() => (chartType = 'candles')}
      >Candles</button>
    </div>
  </div>
  <div class="chart-body">
    {#if loading && !candles.length}
      <div class="chart-loading"><span class="spinner"></span> Fetching historical market data…</div>
    {:else if candles.length}
      <div class="chart-y-labels">{#each yLabels as label}      <span>{priceFormatter(label)}</span>{/each}</div>
      <div
        class="equity-chart-wrap"
        role="presentation"
        on:mouseleave={() => onHoverOrder(null)}
      >
        <svg class="equity-chart" viewBox="0 0 960 310" preserveAspectRatio="none" role="img" aria-label={`${instrument.symbol} price chart${showOrderMarkers ? ' and focused strategy orders' : ''}`}>
          <path class="grid-line" d="M12 34H948 M12 118H948 M12 202H948 M12 286H948" />
          {#if chartType === 'line'}
            <path d={pricePath} class="chart-path" style={`stroke: ${buyAndHoldStrategy.color}`} />
          {:else}
            {#each candles as candle, index}
              {@const x = 12 + ((index + 0.5) / candles.length) * 936}
              {@const openY = getPriceY(candle.o, priceBounds.low, priceBounds.high)}
              {@const closeY = getPriceY(candle.c, priceBounds.low, priceBounds.high)}
              {@const highY = getPriceY(candle.h, priceBounds.low, priceBounds.high)}
              {@const lowY = getPriceY(candle.l, priceBounds.low, priceBounds.high)}
              {@const bodyTop = Math.min(openY, closeY)}
              {@const bodyHeight = Math.max(Math.abs(closeY - openY), 1)}
              <g class="price-candle" class:price-candle-up={candle.c >= candle.o} class:price-candle-down={candle.c < candle.o}>
                <line x1={x} x2={x} y1={highY} y2={lowY} />
                <rect
                  x={x - Math.max((936 / candles.length) * 0.62, 1) / 2}
                  y={bodyTop}
                  width={Math.max((936 / candles.length) * 0.62, 1)}
                  height={bodyHeight}
                  rx=".5"
                />
              </g>
            {/each}
          {/if}
          {#each tradeMarkers as marker}
            <g
              class="trade-marker"
              class:trade-marker-buy={marker.side === 'buy'}
              class:trade-marker-sell={marker.side === 'sell'}
              class:trade-marker-highlighted={hoveredOrder !== null && isSameOrder(marker, hoveredOrder)}
              transform={`translate(${marker.x} ${marker.y})`}
              role="img"
              aria-label={`${marker.side} order at ${new Date(marker.timestamp).toLocaleString()}`}
              on:mouseenter={() => onHoverOrder(marker)}
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
            on:mouseleave={() => onHoverOrder(null)}
          >
            <strong>{hoveredTradeOrder.side.toUpperCase()} · {new Date(hoveredTradeOrder.timestamp).toLocaleString()}</strong>
            <span>Price <b>{priceFormatter(hoveredTradeOrder.price)}</b></span>
            <span>Quantity <b>{formatUnits(hoveredTradeOrder.quantity)} {instrument.baseCurrency}</b></span>
            <span>Notional <b>{formatCurrency(hoveredTradeOrder.notional, instrument.quoteCurrency)}</b></span>
            <span>Fee <b>{formatCurrency(hoveredTradeOrder.fee, instrument.quoteCurrency)}</b></span>
          </div>
        {/if}
      </div>
      <div class="chart-x-labels">
        <span>{new Date(candles[0].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(candles[Math.floor(candles.length / 2)].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(lastCandleCloseTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    {:else}
      <div class="chart-empty">{showOrderMarkers ? 'Run a backtest to see market prices and strategy orders.' : 'Run an analysis to load price data for this market.'}</div>
    {/if}
  </div>
  {#if candles.length}
    <div class="chart-footer">
      <div><span class="footer-label">CANDLES ANALYZED</span><strong>{candles.length.toLocaleString()}</strong></div>
      {#if showOrderMarkers}<div class="chart-footer-note">Orders are plotted at their execution prices.</div>{/if}
    </div>
  {/if}
</section>
