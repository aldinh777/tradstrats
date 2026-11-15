<script lang="ts">
  import { onMount } from 'svelte'
  import { calculateAnalyticsMetrics } from '../analytics'
  import { historicalDataCache } from '../data/cache'
  import type { MarketInstrument, MarketPerformanceSeries } from '../data/types'
  import { loadAnalyticsSelections, saveAnalyticsInstrumentIds } from '../data/selection'
  import {
    formatCurrency,
    formatMonthLabel,
    formatNumber,
    monthRangeTimestamps,
    STARTING_BALANCE,
    FEE_RATE,
  } from '../backtest'
  import { getStrategy, STRATEGY_OPTIONS } from '../strategies'
  import type { Candle } from '../strategies/types'
  import AnalyticsPerformanceChart from './AnalyticsPerformanceChart.svelte'

  export let instruments: MarketInstrument[]
  export let monthOptions: string[]

  type LoadedMarket = {
    instrument: MarketInstrument
    candles: Candle[]
    error: string
  }

  const colors = ['#b9f277', '#71b7e7', '#df9b69', '#bd8bec', '#f08282', '#58c8b7', '#e1d06f', '#df81b5']
  const now = new Date()
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const initialStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))
  const initialStartMonth = `${initialStartDate.getUTCFullYear()}-${String(initialStartDate.getUTCMonth() + 1).padStart(2, '0')}`

  let search = ''
  let selectedIds: string[] = []
  let selectedStrategyId = 'buy-and-hold'
  let startMonth = initialStartMonth
  let endMonth = currentMonth
  let hoveredInstrumentId: string | null = null
  let marketData: LoadedMarket[] = []
  let loading = false
  let errorMessage = ''
  let selectionError = ''

  $: filteredMarkets = instruments.filter((instrument) =>
    `${instrument.symbol} ${instrument.name} ${instrument.providerId}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  $: selectedInstruments = instruments.filter((instrument) => selectedIds.includes(instrument.id))
  $: activeStrategy = getStrategy(selectedStrategyId)
  $: analyticsResults = selectedInstruments.map((instrument, index) => {
    const data = marketData.find((item) => item.instrument.id === instrument.id)
    if (!data) return { instrument, candles: [], result: null, metrics: null, error: '' }
    if (data.error) return { instrument, candles: data.candles, result: null, metrics: null, error: data.error }
    if (!data.candles.length) {
      return {
        instrument,
        candles: data.candles,
        result: null,
        metrics: null,
        error: 'No observations were returned for this period.',
      }
    }

    const result = activeStrategy.run(data.candles, {
      startingBalance: STARTING_BALANCE,
      feeRate: FEE_RATE,
    })
    return {
      instrument,
      candles: data.candles,
      result,
      metrics: calculateAnalyticsMetrics(data.candles, result, STARTING_BALANCE),
      error: '',
      color: colors[index % colors.length],
    }
  })
  $: chartSeries = analyticsResults.flatMap((item) =>
    item.result ? [{
      instrument: item.instrument,
      candles: item.candles,
      result: item.result,
      color: colors[selectedInstruments.findIndex((instrument) => instrument.id === item.instrument.id) % colors.length],
    } satisfies MarketPerformanceSeries] : [],
  )
  $: range = startMonth && endMonth && startMonth <= endMonth
    ? monthRangeTimestamps(startMonth, endMonth)
    : null
  $: startMonthOptions = monthOptions.filter((month) => month <= endMonth)
  $: endMonthOptions = monthOptions.filter((month) => month >= startMonth)

  function persistSelection(ids: string[]) {
    try {
      saveAnalyticsInstrumentIds(ids)
      selectedIds = ids
      selectionError = ''
    } catch (error) {
      selectionError = error instanceof Error ? error.message : 'Unable to save analytics selections.'
    }
  }

  function toggleInstrument(instrumentId: string) {
    persistSelection(
      selectedIds.includes(instrumentId)
        ? selectedIds.filter((id) => id !== instrumentId)
        : [...selectedIds, instrumentId],
    )
  }

  function handleRangeChange() {
    marketData = []
    errorMessage = ''
  }

  async function runAnalytics() {
    if (!selectedInstruments.length) {
      errorMessage = 'Select at least one market to compare.'
      return
    }
    if (!range) {
      errorMessage = 'Start month must be before or equal to end month.'
      return
    }

    loading = true
    errorMessage = ''
    try {
      const results: LoadedMarket[] = new Array(selectedInstruments.length)
      let nextIndex = 0
      const workers = Array.from(
        { length: Math.min(4, selectedInstruments.length) },
        async () => {
          while (nextIndex < selectedInstruments.length) {
            const index = nextIndex
            nextIndex += 1
            const instrument = selectedInstruments[index]
            try {
              const candles = await historicalDataCache.getCandles(instrument, '1d', range)
              results[index] = { instrument, candles, error: '' }
            } catch (error) {
              results[index] = {
                instrument,
                candles: [],
                error: error instanceof Error ? error.message : 'Unable to load historical observations.',
              }
            }
          }
        },
      )
      await Promise.all(workers)
      marketData = results
    } finally {
      loading = false
    }
  }

  function displayMetric(value: number | null, digits = 2): string {
    return value === null || !Number.isFinite(value) ? 'Insufficient observations' : formatNumber(value, digits)
  }

  onMount(() => {
    try {
      const saved = loadAnalyticsSelections()
      selectedIds = saved.exists
        ? saved.ids.filter((id) => instruments.some((instrument) => instrument.id === id))
        : instruments.slice(0, 1).map((instrument) => instrument.id)
      if (!saved.exists) saveAnalyticsInstrumentIds(selectedIds)
    } catch (error) {
      selectionError = error instanceof Error ? error.message : 'Unable to load saved analytics markets.'
    }
  })
</script>

<div class="page-content">
  <section class="page-heading">
    <div>
      <div class="eyebrow"><span class="eyebrow-line"></span> CROSS-MARKET RESEARCH</div>
      <h1>Analytics</h1>
      <p class="page-subtitle">Compare how one strategy performs across selected markets.</p>
    </div>
    <div class="heading-meta">
      <span class="updated-label">MARKETS SELECTED</span>
      <span class="updated-value">{selectedIds.length}</span>
    </div>
  </section>

  {#if selectionError}<div class="error-banner" role="alert">{selectionError}</div>{/if}
  {#if errorMessage}<div class="error-banner" role="alert">{errorMessage}</div>{/if}

  <section class="control-panel analytics-controls" aria-label="Analytics configuration">
    <div class="control-group date-range-control">
      <label for="analytics-start-month">DATE RANGE</label>
      <div class="month-range">
        <div class="select-wrap">
          <select id="analytics-start-month" bind:value={startMonth} on:change={handleRangeChange}>
            {#each startMonthOptions as month}<option value={month}>{formatMonthLabel(month)}</option>{/each}
          </select>
          <span class="select-chevron">⌄</span>
        </div>
        <span>to</span>
        <div class="select-wrap">
          <select id="analytics-end-month" bind:value={endMonth} on:change={handleRangeChange}>
            {#each endMonthOptions as month}<option value={month}>{formatMonthLabel(month)}</option>{/each}
          </select>
          <span class="select-chevron">⌄</span>
        </div>
      </div>
    </div>
    <div class="control-divider"></div>
    <div class="control-group analytics-strategy-control">
      <label for="analytics-strategy">STRATEGY</label>
      <div class="select-wrap">
        <select id="analytics-strategy" bind:value={selectedStrategyId}>
          {#each STRATEGY_OPTIONS as strategy}
            <option value={strategy.id}>{strategy.name}</option>
          {/each}
        </select>
        <span class="select-chevron">⌄</span>
      </div>
    </div>
    <div class="control-action">
      <button class="run-button" type="button" on:click={runAnalytics} disabled={loading || !selectedInstruments.length}>
        {#if loading}<span class="spinner"></span> Analyzing…{:else}<span>Compare markets</span><span class="run-arrow">↗</span>{/if}
      </button>
    </div>
  </section>
  <div class="analytics-assumption">
    Daily observations only. Each run starts with {formatNumber(STARTING_BALANCE, 0)} quote-currency units; existing strategy fees and minimum-order rules apply. Lines are normalized to 100.
  </div>

  <section class="analytics-market-panel" aria-label="Choose markets for analytics">
    <div class="analytics-market-heading">
      <div>
        <h2>Selected Data Source markets</h2>
        <p>This selection is independent of the Data Source page. Select one or more markets to compare.</p>
      </div>
      <label class="source-search">
        <span>FILTER</span>
        <input bind:value={search} type="search" placeholder="Search tickers" />
      </label>
    </div>
    {#if !instruments.length}
      <div class="source-empty">No markets are selected in Data Source. Add markets there first.</div>
    {:else}
      <div class="analytics-market-grid">
        {#each filteredMarkets as instrument, index (instrument.id)}
          {@const selected = selectedIds.includes(instrument.id)}
          <button
            type="button"
            class="analytics-market-card"
            class:analytics-market-selected={selected}
            class:analytics-market-hovered={hoveredInstrumentId === instrument.id}
            style={`--market-color: ${colors[index % colors.length]}`}
            aria-pressed={selected}
            on:mouseenter={() => (hoveredInstrumentId = instrument.id)}
            on:mouseleave={() => (hoveredInstrumentId = null)}
            on:click={() => toggleInstrument(instrument.id)}
          >
            <span class="analytics-market-dot"></span>
            <span class="analytics-market-copy">
              <strong>{instrument.symbol}</strong>
              <small>{instrument.providerId === 'frankfurter' ? `${instrument.baseCurrency} in ${instrument.quoteCurrency}` : 'Perpetual market'}</small>
            </span>
            <span class="analytics-market-state">{selected ? 'Selected' : 'Select'}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="analytics-selection-footer">
      <span>{selectedIds.length} selected</span>
      <span>{filteredMarkets.length.toLocaleString()} markets shown · Hover highlights, click toggles</span>
    </div>
  </section>

  <AnalyticsPerformanceChart
    series={chartSeries}
    startTime={range?.startTime ?? Date.now()}
    endTime={range?.endTime ?? Date.now()}
    highlightedInstrumentId={hoveredInstrumentId}
  />

  <section class="analytics-statistics" aria-label="Selected market statistics">
    <div class="analytics-section-heading">
      <div>
        <h2>Market statistics</h2>
        <p>{selectedStrategyId === 'buy-and-hold' ? 'Buy & Hold' : activeStrategy.name} results for {startMonth} to {endMonth}.</p>
      </div>
    </div>
    {#if !analyticsResults.length}
      <div class="comparison-empty">Select markets above and run an analysis to view statistics.</div>
    {:else}
      <div class="analytics-stat-grid">
        {#each analyticsResults as item (item.instrument.id)}
          <article
            class="analytics-stat-card"
            class:analytics-stat-card-hovered={hoveredInstrumentId === item.instrument.id}
            style={`--market-color: ${colors[selectedInstruments.findIndex((market) => market.id === item.instrument.id) % colors.length]}`}
            on:mouseenter={() => (hoveredInstrumentId = item.instrument.id)}
            on:mouseleave={() => (hoveredInstrumentId = null)}
          >
            <header class="analytics-stat-card-heading">
              <span class="analytics-market-dot"></span>
              <strong>{item.instrument.symbol}</strong>
              <span>{item.instrument.providerId}</span>
            </header>
            {#if item.error}
              <div class="analytics-market-error" role="status">{item.error}</div>
            {:else if !item.metrics}
              <div class="analytics-market-empty">{loading ? 'Loading historical observations…' : 'Run comparison to calculate statistics.'}</div>
            {:else}
              <div class="analytics-stat-group">
                <h3>Price information <small>observed closing reference prices</small></h3>
                <div><span>Last price</span><strong>{item.metrics.lastPrice === null ? 'Insufficient observations' : `${formatNumber(item.metrics.lastPrice, 5)} ${item.instrument.quoteCurrency}`}</strong></div>
                <div><span>Highest close</span><strong>{item.metrics.highestPrice === null ? 'Insufficient observations' : `${formatNumber(item.metrics.highestPrice, 5)} ${item.instrument.quoteCurrency}`}</strong></div>
                <div><span>Lowest close</span><strong>{item.metrics.lowestPrice === null ? 'Insufficient observations' : `${formatNumber(item.metrics.lowestPrice, 5)} ${item.instrument.quoteCurrency}`}</strong></div>
                <div><span>Average close</span><strong>{item.metrics.averagePrice === null ? 'Insufficient observations' : `${formatNumber(item.metrics.averagePrice, 5)} ${item.instrument.quoteCurrency}`}</strong></div>
              </div>
              <div class="analytics-stat-group">
                <h3>Strategy performance <small>{activeStrategy.name} · period</small></h3>
                <div><span>Absolute return</span><strong>{item.metrics.absoluteReturn === null ? 'Insufficient observations' : formatCurrency(item.metrics.absoluteReturn, item.instrument.quoteCurrency)}</strong></div>
                <div><span>Percentage return</span><strong>{displayMetric(item.metrics.percentageReturn)}%</strong></div>
                <div><span>Maximum drawdown</span><strong>{displayMetric(item.metrics.maxDrawdown)}%</strong></div>
              </div>
              <div class="analytics-stat-group">
                <h3>Risk & activity <small>252-observation annualization; risk-free rate 0</small></h3>
                <div><span>Annualized volatility</span><strong>{item.metrics.annualizedVolatility === null ? 'Insufficient observations' : `${displayMetric(item.metrics.annualizedVolatility)}%`}</strong></div>
                <div><span>Sharpe ratio</span><strong>{displayMetric(item.metrics.sharpeRatio, 3)}</strong></div>
                <div><span>Volume ({item.instrument.baseCurrency})</span><strong>{item.metrics.totalVolume === null ? 'Not provided by source' : formatNumber(item.metrics.totalVolume, 4)}</strong></div>
                <div><span>Observations</span><strong>{item.candles.length}</strong></div>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <footer class="page-footer">
    <span>Returns are strategy equity changes in each instrument’s quote currency.</span>
    <span>FX rates are daily ECB reference observations, not intraday prices.</span>
  </footer>
</div>
