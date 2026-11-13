<script lang="ts">
  import type { StrategyOption } from '../strategies/types'

  export let markets: string[]
  export let strategies: StrategyOption[]
  export let selectedCoin: string
  export let selectedInterval: string
  export let startMonth: string
  export let endMonth: string
  export let currentMonth: string
  export let selectedStrategyIds: string[]
  export let loading: boolean
  export let errorMessage: string
  export let onRun: () => void

  $: canSelectMoreStrategies = selectedStrategyIds.length >= 4
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
  <div class="control-group date-range-control">
    <label for="start-month">DATE RANGE</label>
    <div class="month-range">
      <input id="start-month" type="month" bind:value={startMonth} max={endMonth} aria-label="Start month" />
      <span>to</span>
      <input
        id="end-month"
        type="month"
        bind:value={endMonth}
        min={startMonth}
        max={currentMonth}
        aria-label="End month"
      />
    </div>
  </div>
  <div class="control-divider strategy-divider"></div>
  <div class="control-group comparison-control">
    <span class="control-label">COMPARE</span>
    <div class="strategy-count">{selectedStrategyIds.length} <span>/ 4 max</span></div>
  </div>
  <div class="control-action">
    <button class="run-button" on:click={onRun} disabled={loading || !markets.length}>
      {#if loading}<span class="spinner"></span> Running…{:else}<span>Run backtest</span><span class="run-arrow">↗</span>{/if}
    </button>
  </div>
</section>

<section class="strategy-config" aria-label="Choose strategies to compare">
  <div class="config-title"><span class="sliders-icon">≡</span> Compare strategies</div>
  <div class="config-divider"></div>
  <div class="strategy-options">
    {#each strategies as strategy}
      <label
        class="strategy-option"
        class:strategy-option-selected={selectedStrategyIds.includes(strategy.id)}
        class:strategy-option-disabled={!selectedStrategyIds.includes(strategy.id) && canSelectMoreStrategies}
        title={strategy.description}
      >
        <input
          type="checkbox"
          value={strategy.id}
          bind:group={selectedStrategyIds}
          disabled={!selectedStrategyIds.includes(strategy.id) && canSelectMoreStrategies}
        />
        <span class="strategy-option-dot" style={`--strategy-color: ${strategy.color}`}></span>
        <span>{strategy.name}</span>
      </label>
    {/each}
  </div>
  <div class="config-note"><span class="info-icon">i</span> Up to 4 · 0.05% fee per buy/sell</div>
</section>

{#if errorMessage}
  <div class="error-banner" role="alert">
    <span class="error-icon">!</span>
    <div><strong>Couldn’t run backtest</strong><span>{errorMessage}</span></div>
    <button on:click={onRun} disabled={loading}>Retry</button>
  </div>
{/if}
