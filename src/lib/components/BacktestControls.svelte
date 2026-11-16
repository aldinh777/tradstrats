<script lang="ts">
  import { formatMonthLabel } from '../backtest'
  import type { MarketInstrument } from '../data/types'
  import { STRATEGY_CATEGORIES, type StrategyCategory, type StrategyOption } from '../strategies/types'

  export let markets: MarketInstrument[]
  export let selectedInstrumentId: string
  export let quoteCurrency: string
  export let strategies: StrategyOption[]
  export let onSelectInstrument: (instrumentId: string) => void
  export let startMonth: string
  export let endMonth: string
  export let monthOptions: string[]
  export let selectedStrategyIds: string[]
  export let loading: boolean
  export let errorMessage: string
  export let onRun: () => void

  let marketQuery = ''
  let marketMenuOpen = false

  $: startMonthOptions = monthOptions.filter((month) => month <= endMonth)
  $: endMonthOptions = monthOptions.filter((month) => month >= startMonth)
  $: selectedMarket = markets.find((market) => market.id === selectedInstrumentId)
  $: filteredMarkets = markets.filter((market) =>
    `${market.symbol} ${market.name} ${market.providerId}`
      .toLowerCase()
      .includes(marketQuery.trim().toLowerCase()),
  )
  $: strategyGroups = STRATEGY_CATEGORIES.map((category: StrategyCategory) => ({
    category,
    strategies: strategies.filter((strategy) => strategy.category === category),
  })).filter((group) => group.strategies.length > 0)
  $: if (!marketMenuOpen && marketQuery !== (selectedMarket?.symbol ?? '')) {
    marketQuery = selectedMarket?.symbol ?? ''
  }

  function openMarketMenu() {
    if (marketQuery === selectedMarket?.symbol) marketQuery = ''
    marketMenuOpen = true
  }

  function selectMarket(market: MarketInstrument) {
    onSelectInstrument(market.id)
    marketQuery = market.symbol
    marketMenuOpen = false
  }

  function handleMarketKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      marketMenuOpen = false
      marketQuery = selectedMarket?.symbol ?? ''
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      marketMenuOpen = true
      const firstOption = event.currentTarget instanceof HTMLElement
        ? event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.market-option')
        : null
      firstOption?.focus()
    } else if (event.key === 'Enter' && filteredMarkets.length === 1) {
      event.preventDefault()
      selectMarket(filteredMarkets[0])
    }
  }

  function handleMarketFocusOut(event: FocusEvent) {
    const container = event.currentTarget
    const nextTarget = event.relatedTarget
    if (container instanceof HTMLElement && nextTarget instanceof Node && container.contains(nextTarget)) {
      return
    }
    marketMenuOpen = false
    marketQuery = selectedMarket?.symbol ?? ''
  }
</script>

<section class="control-panel" aria-label="Backtest configuration">
  <div class="control-group market-control">
    <label for="market">MARKET</label>
    <div class="market-picker" role="group" aria-label="Select market" on:focusout={handleMarketFocusOut}>
      <span class="coin-icon">{selectedMarket?.baseCurrency.slice(0, 1) ?? '?'}</span>
      <input
        id="market"
        type="search"
        role="combobox"
        aria-label="Search markets"
        aria-autocomplete="list"
        aria-expanded={marketMenuOpen}
        aria-controls="market-options"
        placeholder={markets.length ? 'Search selected markets' : 'Select markets in Data Source'}
        bind:value={marketQuery}
        disabled={!markets.length}
        on:focus={openMarketMenu}
        on:input={() => (marketMenuOpen = true)}
        on:keydown={handleMarketKeydown}
      />
      {#if marketMenuOpen && markets.length}
        <div class="market-options" id="market-options" role="listbox" aria-label="Markets">
          {#each filteredMarkets as market}
            <button
              type="button"
              class="market-option"
              class:market-option-selected={market.id === selectedInstrumentId}
              role="option"
              aria-selected={market.id === selectedInstrumentId}
              on:click={() => selectMarket(market)}
            >{market.symbol} · {market.providerId}</button>
          {:else}
            <div class="market-no-results">No matching markets</div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  <div class="control-divider"></div>
  <div class="control-group">
    <span class="control-label">TIMEFRAME</span>
    <strong class="fixed-timeframe">1 day</strong>
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
  <div class="config-note">
    <span class="info-icon">i</span>
    {quoteCurrency === 'USD' ? '$10' : `10 ${quoteCurrency}`} min order · 0.05% fee
  </div>
</section>

{#if errorMessage}
  <div class="error-banner" role="alert">
    <span class="error-icon">!</span>
    <div><strong>Couldn’t run backtest</strong><span>{errorMessage}</span></div>
    <button on:click={onRun} disabled={loading}>Retry</button>
  </div>
{/if}
