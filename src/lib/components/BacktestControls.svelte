<script lang="ts">
  import { DATE_RANGES } from '../backtest'

  export let markets: string[]
  export let selectedCoin: string
  export let selectedInterval: string
  export let selectedRange: number
  export let fastPeriod: number
  export let slowPeriod: number
  export let loading: boolean
  export let errorMessage: string
  export let onRun: () => void
</script>

<section class="control-panel" aria-label="Backtest configuration">
  <div class="control-group market-control">
    <label for="market">MARKET</label>
    <div class="select-wrap market-select">
      <span class="coin-icon">{selectedCoin.slice(0, 1)}</span>
      <select id="market" bind:value={selectedCoin} disabled={!markets.length}>
        {#if !markets.length}<option>Loading markets…</option>{/if}
        {#each markets as market}<option value={market}>{market}-USD</option>{/each}
      </select>
      <span class="select-chevron">⌄</span>
    </div>
  </div>
  <div class="control-divider"></div>
  <div class="control-group">
    <label for="interval">TIMEFRAME</label>
    <div class="select-wrap">
      <select id="interval" bind:value={selectedInterval}>
        <option value="1h">1 hour</option>
        <option value="4h">4 hours</option>
        <option value="1d">1 day</option>
      </select>
      <span class="select-chevron">⌄</span>
    </div>
  </div>
  <div class="control-divider"></div>
  <div class="control-group">
    <label for="period">DATE RANGE</label>
    <div class="select-wrap">
      <select id="period" bind:value={selectedRange}>
        {#each DATE_RANGES as range}<option value={range.days}>{range.label}</option>{/each}
      </select>
      <span class="select-chevron">⌄</span>
    </div>
  </div>
  <div class="control-divider strategy-divider"></div>
  <div class="control-group strategy-control">
    <span class="control-label">STRATEGY</span>
    <div class="strategy-name"><span class="strategy-icon">↗</span> SMA crossover</div>
  </div>
  <div class="control-action">
    <button class="run-button" on:click={onRun} disabled={loading || !markets.length}>
      {#if loading}<span class="spinner"></span> Running…{:else}<span>Run backtest</span><span class="run-arrow">↗</span>{/if}
    </button>
  </div>
</section>

<section class="strategy-config" aria-label="Strategy parameters">
  <div class="config-title"><span class="sliders-icon">≡</span> Strategy parameters</div>
  <div class="config-divider"></div>
  <label class="period-input" for="fast-period"><span>Fast SMA</span><input id="fast-period" type="number" min="1" max="499" bind:value={fastPeriod} /><span class="bars-label">bars</span></label>
  <label class="period-input" for="slow-period"><span>Slow SMA</span><input id="slow-period" type="number" min="2" max="500" bind:value={slowPeriod} /><span class="bars-label">bars</span></label>
  <div class="config-note"><span class="info-icon">i</span> 0.05% fee per trade included</div>
</section>

{#if errorMessage}
  <div class="error-banner" role="alert">
    <span class="error-icon">!</span>
    <div><strong>Couldn’t run backtest</strong><span>{errorMessage}</span></div>
    <button on:click={onRun} disabled={loading}>Retry</button>
  </div>
{/if}
