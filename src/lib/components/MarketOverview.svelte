<script lang="ts">
  import { formatNumber, formatPercent, formatTimeframeLabel, type Candle } from '../backtest'
  import type { MarketInstrument } from '../data/types'

  export let instrument: MarketInstrument
  export let interval: string
  export let candles: Candle[]
  export let loading: boolean

  $: latestPrice = candles.length ? candles[candles.length - 1].c : 0
  $: marketChange =
    candles.length > 1 ? (candles[candles.length - 1].c / candles[0].c - 1) * 100 : 0
  $: totalVolume = candles.length && candles.every((candle) => typeof candle.v === 'number')
    ? candles.reduce((sum, candle) => sum + (candle.v ?? 0), 0)
    : null
  $: priceDigits = latestPrice < 1 ? 6 : latestPrice < 100 ? 4 : 2
</script>

<section class="market-strip">
  <div class="asset-details">
    <span class="asset-icon">{instrument.baseCurrency.slice(0, 1)}</span>
    <div>
      <div class="asset-name">{instrument.symbol}</div>
      <div class="asset-type">{instrument.marketType === 'forex' ? 'DAILY FX REFERENCE · FRANKFURTER' : 'PERPETUAL · HYPERLIQUID'}</div>
    </div>
  </div>
  <div class="asset-price">
    {#if loading && !candles.length}<span class="skeleton skeleton-price"></span>{:else if candles.length}{formatNumber(latestPrice, priceDigits)} {instrument.quoteCurrency}{:else}—{/if}
  </div>
  <div class:negative={marketChange < 0} class="asset-change">
    {candles.length ? formatPercent(marketChange) : '—'} <span>period</span>
  </div>
  <div class="market-divider"></div>
  <div class="market-stat"><span>TIMEFRAME</span><strong>{formatTimeframeLabel(interval)}</strong></div>
  <div class="market-stat"><span>HISTORY</span><strong>{candles.length ? `${candles.length} candles` : '—'}</strong></div>
  <div class="market-stat">
    <span>DATA SOURCE</span>
    <strong class="source-value">{instrument.providerId}</strong>
  </div>
  {#if instrument.marketType === 'perpetual'}
    <div class="market-stat">
      <span>BASE VOLUME</span>
      <strong>{totalVolume === null ? '—' : formatNumber(totalVolume, 2)}</strong>
    </div>
  {/if}
</section>
