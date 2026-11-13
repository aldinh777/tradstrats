<script lang="ts">
  import { formatCurrency, formatPercent, formatTimeframeLabel, type Candle } from '../backtest'

  export let coin: string
  export let interval: string
  export let candles: Candle[]
  export let loading: boolean

  $: latestPrice = candles.length ? candles[candles.length - 1].c : 0
  $: marketChange =
    candles.length > 1 ? (candles[candles.length - 1].c / candles[0].c - 1) * 100 : 0
</script>

<section class="market-strip">
  <div class="asset-details">
    <span class="asset-icon">{coin.slice(0, 1)}</span>
    <div>
      <div class="asset-name">{coin} <span class="asset-pair">/ USD</span></div>
      <div class="asset-type">PERPETUAL · HYPERLIQUID</div>
    </div>
  </div>
  <div class="asset-price">
    {#if loading && !candles.length}<span class="skeleton skeleton-price"></span>{:else}{formatCurrency(latestPrice)}{/if}
  </div>
  <div class:negative={marketChange < 0} class="asset-change">
    {candles.length ? formatPercent(marketChange) : '—'} <span>period</span>
  </div>
  <div class="market-divider"></div>
  <div class="market-stat"><span>TIMEFRAME</span><strong>{formatTimeframeLabel(interval)}</strong></div>
  <div class="market-stat"><span>HISTORY</span><strong>{candles.length ? `${candles.length} candles` : '—'}</strong></div>
  <div class="market-stat">
    <span>DATA SOURCE</span>
    <strong class="source-value"><span class="live-dot"></span> Hyperliquid</strong>
  </div>
</section>
