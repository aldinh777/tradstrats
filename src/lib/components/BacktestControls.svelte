<script lang="ts">
  import { formatMonthLabel, TIMEFRAMES } from '../backtest'
  import { STRATEGY_CATEGORIES, type StrategyCategory, type StrategyOption } from '../strategies/types'

  export let markets: string[]
  export let strategies: StrategyOption[]
  export let selectedCoin: string
  export let selectedInterval: string
  export let startMonth: string
  export let endMonth: string
  export let monthOptions: string[]
  export let selectedStrategyIds: string[]
  export let loading: boolean
  export let errorMessage: string
  export let onRun: () => void

  $: startMonthOptions = monthOptions.filter((month) => month <= endMonth)
  $: endMonthOptions = monthOptions.filter((month) => month >= startMonth)
  $: strategyGroups = STRATEGY_CATEGORIES.map((category: StrategyCategory) => ({
    category,
    strategies: strategies.filter((strategy) => strategy.category === category),
  })).filter((group) => group.strategies.length > 0)
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
        {#each TIMEFRAMES as timeframe}
          <option value={timeframe.value}>{timeframe.label}</option>
        {/each}
      </select>
      <span class="select-chevron">⌄</span>
    </div>
  </div>
  <div class="control-divider"></div>
  <div class="control-group date-range-control">
    <label for="start-month">DATE RANGE</label>
    <div class="month-range">
      <div class="select-wrap">
        <select id="start-month" bind:value={startMonth} aria-label="Start month">
          {#each startMonthOptions as month}<option value={month}>{formatMonthLabel(month)}</option>{/each}
        </select>
        <span class="select-chevron">⌄</span>
      </div>
      <span>to</span>
      <div class="select-wrap">
        <select id="end-month" bind:value={endMonth} aria-label="End month">
          {#each endMonthOptions as month}<option value={month}>{formatMonthLabel(month)}</option>{/each}
        </select>
        <span class="select-chevron">⌄</span>
      </div>
    </div>
  </div>
  <div class="control-divider strategy-divider"></div>
  <div class="control-group comparison-control">
    <span class="control-label">COMPARE</span>
    <div class="strategy-count">{selectedStrategyIds.length} <span>selected</span></div>
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
  <div class="strategy-groups">
    {#each strategyGroups as group}
      <div class="strategy-category">
        <span class="strategy-category-title">{group.category}</span>
        <div class="strategy-options">
          {#each group.strategies as strategy}
            <label
              class="strategy-option"
              class:strategy-option-selected={selectedStrategyIds.includes(strategy.id)}
              title={strategy.description}
            >
              <input type="checkbox" value={strategy.id} bind:group={selectedStrategyIds} />
              <span class="strategy-option-dot" style={`--strategy-color: ${strategy.color}`}></span>
              <span>{strategy.shortName ?? strategy.name}</span>
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  <div class="config-note"><span class="info-icon">i</span> 0.05% fee per buy/sell</div>
</section>

{#if errorMessage}
  <div class="error-banner" role="alert">
    <span class="error-icon">!</span>
    <div><strong>Couldn’t run backtest</strong><span>{errorMessage}</span></div>
    <button on:click={onRun} disabled={loading}>Retry</button>
  </div>
{/if}
