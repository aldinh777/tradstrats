<script lang="ts">
  import { onMount } from 'svelte'
  import {
    calculateAnalyticsMetrics,
    calculateCombinedPortfolioMetrics,
    combineTokenPerformanceSeries,
    sortAnalyticsResults,
    type AnalyticsMetrics,
    type AnalyticsSortDirection,
    type AnalyticsSortMetric,
  } from '../analytics'
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
  import type { Candle, StrategyComparison } from '../strategies/types'
  import AnalyticsCombinedPortfolioChart from './AnalyticsCombinedPortfolioChart.svelte'
  import AnalyticsPerformanceChart from './AnalyticsPerformanceChart.svelte'
  import PriceChart from './PriceChart.svelte'

  export let instruments: MarketInstrument[]
  export let monthOptions: string[]

  type LoadedMarket = {
    instrument: MarketInstrument
    candles: Candle[]
    error: string
  }

  const colors = ['#b9f277', '#71b7e7', '#df9b69', '#bd8bec', '#f08282', '#58c8b7', '#e1d06f', '#df81b5']
  const noComparisons: StrategyComparison[] = []
  const now = new Date()
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const initialStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))
  const initialStartMonth = `${initialStartDate.getUTCFullYear()}-${String(initialStartDate.getUTCMonth() + 1).padStart(2, '0')}`

  let search = ''
  let selectedIds: string[] = []
  let selectedStrategyId = 'buy-and-hold'
  let sortMetric: AnalyticsSortMetric = 'percentageReturn'
  let sortDirection: AnalyticsSortDirection = 'descending'
  let startMonth = initialStartMonth
  let endMonth = currentMonth
  let hoveredInstrumentId: string | null = null
  let chartFocusInstrumentId: string | null = null
  let marketData: LoadedMarket[] = []
  let loading = false
  let errorMessage = ''
  let selectionError = ''

  $: filteredMarkets = instruments.filter((instrument) =>
    `${instrument.symbol} ${instrument.name} ${instrument.providerId}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  $: marketGroups = [
    { title: 'Tokens', markets: filteredMarkets.filter((instrument) => instrument.marketType === 'perpetual') },
    { title: 'Currencies', markets: filteredMarkets.filter((instrument) => instrument.marketType === 'forex') },
  ]
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
      metrics: calculateAnalyticsMetrics(data.candles, result, STARTING_BALANCE, instrument.quoteCurrency),
      error: '',
      color: colors[index % colors.length],
    }
  })
  $: sortedAnalyticsResults = sortAnalyticsResults(analyticsResults, sortMetric, sortDirection)
  $: if (chartFocusInstrumentId && !selectedIds.includes(chartFocusInstrumentId)) {
    chartFocusInstrumentId = null
  }
  $: chartFocusResult = analyticsResults.find(
    (item) => item.instrument.id === chartFocusInstrumentId,
  ) ?? null
  $: chartSeries = analyticsResults.flatMap((item) =>
    item.result ? [{
      instrument: item.instrument,
      candles: item.candles,
      result: item.result,
      color: colors[
        selectedInstruments.findIndex((instrument) => instrument.id === item.instrument.id) % colors.length
      ],
    } satisfies MarketPerformanceSeries] : [],
  )
  $: combinedPortfolio = combineTokenPerformanceSeries(chartSeries)
  $: portfolioMarkets = analyticsResults.filter(
    (item) => item.instrument.marketType === 'perpetual' && item.result !== null,
  )
  $: combinedDollarVolume = portfolioMarkets.length > 0 &&
      portfolioMarkets.every((item) => item.metrics !== null && item.metrics.totalDollarVolume !== null)
    ? portfolioMarkets.reduce((total, item) => total + (item.metrics?.totalDollarVolume ?? 0), 0)
    : null
  $: combinedPortfolioMetrics = calculateCombinedPortfolioMetrics(
    combinedPortfolio,
    STARTING_BALANCE,
    combinedDollarVolume,
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

  function toggleMarketGroup(markets: MarketInstrument[]) {
    const groupIds = markets.map((instrument) => instrument.id)
    const allSelected = groupIds.every((id) => selectedIds.includes(id))
    persistSelection(
      allSelected
        ? selectedIds.filter((id) => !groupIds.includes(id))
        : [...new Set([...selectedIds, ...groupIds])],
    )
  }

  function setIndeterminate(node: HTMLInputElement, indeterminate: boolean) {
    node.indeterminate = indeterminate
    return {
      update(value: boolean) {
        node.indeterminate = value
      },
    }
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

  function sortMetricLabel(): string {
    return {
      percentageReturn: 'Return',
      annualizedVolatility: 'Volatility',
      maxDrawdown: 'Drawdown',
      sharpeRatio: 'Sharpe',
    }[sortMetric]
  }

  function displaySortMetric(metrics: AnalyticsMetrics | null): string {
    const value = metrics?.[sortMetric] ?? null
    if (value === null || !Number.isFinite(value)) return 'Insufficient observations'
    return sortMetric === 'sharpeRatio'
      ? formatNumber(value, 3)
      : `${formatNumber(value)}%`
  }

  function sortMetricTone(metrics: AnalyticsMetrics | null): string {
    const value = metrics?.[sortMetric] ?? null
    if (sortMetric === 'percentageReturn') return metricTone('return', value)
    if (sortMetric === 'annualizedVolatility') return metricTone('volatility', value)
    if (sortMetric === 'maxDrawdown') return metricTone('drawdown', value)
    return metricTone('sharpe', value)
  }

  function toggleChartFocus(instrumentId: string) {
    chartFocusInstrumentId = chartFocusInstrumentId === instrumentId ? null : instrumentId
  }

  function metricTone(
    kind: 'return' | 'volatility' | 'drawdown' | 'sharpe',
    value: number | null,
  ): string {
    if (value === null || !Number.isFinite(value)) return ''
    if (kind === 'return') {
      return value > 0 ? (value >= 20 ? 'metric-good-strong' : 'metric-good')
        : value < 0 ? (value <= -20 ? 'metric-bad-strong' : 'metric-bad')
          : ''
    }
    if (kind === 'volatility') {
      return value >= 50 ? 'metric-bad-strong'
        : value >= 25 ? 'metric-bad'
          : value >= 10 ? 'metric-caution'
            : 'metric-good'
    }
    if (kind === 'drawdown') {
      return value >= 20 ? 'metric-bad-strong'
        : value >= 10 ? 'metric-bad'
          : value > 0 ? 'metric-caution'
            : 'metric-good'
    }
    return value < -1 ? 'metric-bad-strong'
      : value < 0 ? 'metric-bad'
        : value >= 2 ? 'metric-good-strong'
          : value >= 1 ? 'metric-good'
            : value > 0 ? 'metric-caution'
              : ''
  }

  onMount(() => {
    try {
      const saved = loadAnalyticsSelections()
      const resolvedIds = saved.ids.flatMap((id) => {
        const exact = instruments.find((instrument) => instrument.id === id)
        if (exact) return [exact.id]
        const legacyPair = /^frankfurter:USD\/([A-Z]{3})$/.exec(id)
        const migrated = legacyPair
          ? instruments.find((instrument) =>
            instrument.providerId === 'frankfurter' &&
            instrument.baseCurrency === legacyPair[1] &&
            instrument.quoteCurrency === 'USD',
          )
          : undefined
        return migrated ? [migrated.id] : []
      })
      selectedIds = saved.exists
        ? resolvedIds
        : instruments.slice(0, 1).map((instrument) => instrument.id)
      if (!saved.exists || resolvedIds.length !== saved.ids.length ||
        resolvedIds.some((id, index) => id !== saved.ids[index])) {
        saveAnalyticsInstrumentIds(selectedIds)
      }
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
        {#each marketGroups as group (group.title)}
          {#if group.markets.length}
            {@const selectedCount = group.markets.filter((instrument) => selectedIds.includes(instrument.id)).length}
            <section class="analytics-market-group" aria-label={group.title}>
              <div class="analytics-market-group-heading">
                <h3>{group.title}<span>{group.markets.length}</span></h3>
                <label class="analytics-market-group-toggle">
                  <input
                    type="checkbox"
                    checked={selectedCount === group.markets.length}
                    use:setIndeterminate={selectedCount > 0 && selectedCount < group.markets.length}
                    aria-label={`Select all ${group.title.toLowerCase()} shown`}
                    on:change={() => toggleMarketGroup(group.markets)}
                  />
                  <span>Select all shown</span>
                </label>
              </div>
              <div class="analytics-market-group-grid">
                {#each group.markets as instrument (instrument.id)}
                  {@const selected = selectedIds.includes(instrument.id)}
                  {@const colorIndex = instruments.findIndex((market) => market.id === instrument.id)}
                  <button
                    type="button"
                    class="analytics-market-card"
                    class:analytics-market-selected={selected}
                    class:analytics-market-hovered={hoveredInstrumentId === instrument.id}
                    style={`--market-color: ${colors[colorIndex % colors.length]}`}
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
            </section>
          {/if}
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

  <div class="analytics-results-layout">
    <div class="analytics-results-main">
  {#if chartFocusResult}
    <PriceChart
      instrument={chartFocusResult.instrument}
      interval="1d"
      comparisons={noComparisons}
      candles={chartFocusResult.candles}
      loading={loading}
      highlightedStrategyId={null}
      hoveredOrder={null}
      onHoverOrder={() => {}}
      showOrderMarkers={false}
    />
  {:else}
    <AnalyticsCombinedPortfolioChart
      portfolio={combinedPortfolio}
      startTime={range?.startTime ?? Date.now()}
      endTime={range?.endTime ?? Date.now()}
    />
  {/if}

  <section class="analytics-statistics-detail" aria-label="Chart statistics">
    <div class="analytics-section-heading">
      <div>
        <h2>{chartFocusResult ? `${chartFocusResult.instrument.symbol} statistics` : 'Combined token portfolio statistics'}</h2>
        <p>{chartFocusResult
          ? `${activeStrategy.name} results for ${startMonth} to ${endMonth}.`
          : `Equal initial allocation across ${combinedPortfolio.marketCount} token markets · no rebalancing.`}</p>
      </div>
    </div>
    {#if chartFocusResult}
      {#if chartFocusResult.error}
        <div class="analytics-market-error" role="status">{chartFocusResult.error}</div>
      {:else if !chartFocusResult.metrics}
        <div class="analytics-market-empty">{loading ? 'Loading historical observations…' : 'Run comparison to calculate statistics.'}</div>
      {:else}
        {@const detail = chartFocusResult}
        {@const priceDigits = detail.instrument.marketType === 'forex' ? 8 : 5}
        <div class="analytics-detail-grid">
          <div class="analytics-stat-group">
            <h3>Price information <small>observed closing reference prices</small></h3>
            <div><span>Last price</span><strong>{detail.metrics.lastPrice === null ? 'Insufficient observations' : `${formatNumber(detail.metrics.lastPrice, priceDigits)} ${detail.instrument.quoteCurrency}`}</strong></div>
            <div><span>Highest close</span><strong>{detail.metrics.highestPrice === null ? 'Insufficient observations' : `${formatNumber(detail.metrics.highestPrice, priceDigits)} ${detail.instrument.quoteCurrency}`}</strong></div>
            <div><span>Lowest close</span><strong>{detail.metrics.lowestPrice === null ? 'Insufficient observations' : `${formatNumber(detail.metrics.lowestPrice, priceDigits)} ${detail.instrument.quoteCurrency}`}</strong></div>
            <div><span>Average close</span><strong>{detail.metrics.averagePrice === null ? 'Insufficient observations' : `${formatNumber(detail.metrics.averagePrice, priceDigits)} ${detail.instrument.quoteCurrency}`}</strong></div>
          </div>
          <div class="analytics-stat-group">
            <h3>Strategy performance <small>{activeStrategy.name} · period</small></h3>
            <div><span>Absolute return</span><strong class={metricTone('return', detail.metrics.percentageReturn)}>{detail.metrics.absoluteReturn === null ? 'Insufficient observations' : formatCurrency(detail.metrics.absoluteReturn, detail.instrument.quoteCurrency)}</strong></div>
            <div><span>Percentage return</span><strong class={metricTone('return', detail.metrics.percentageReturn)}>{displayMetric(detail.metrics.percentageReturn)}%</strong></div>
            <div><span>Maximum drawdown</span><strong class={metricTone('drawdown', detail.metrics.maxDrawdown)}>{displayMetric(detail.metrics.maxDrawdown)}%</strong></div>
          </div>
          <div class="analytics-stat-group">
            <h3>Risk & activity <small>252-observation annualization; risk-free rate 0</small></h3>
            <div><span>Annualized volatility</span><strong class={metricTone('volatility', detail.metrics.annualizedVolatility)}>{detail.metrics.annualizedVolatility === null ? 'Insufficient observations' : `${displayMetric(detail.metrics.annualizedVolatility)}%`}</strong></div>
            <div><span>Sharpe ratio</span><strong class={metricTone('sharpe', detail.metrics.sharpeRatio)}>{displayMetric(detail.metrics.sharpeRatio, 3)}</strong></div>
            <div><span>Dollar volume (USD)</span><strong>{detail.instrument.quoteCurrency !== 'USD'
              ? 'Unavailable for non-USD quote'
              : detail.metrics.totalDollarVolume === null
                ? 'Not provided by source'
                : `$${formatNumber(detail.metrics.totalDollarVolume, 2)}`}</strong></div>
          </div>
        </div>
      {/if}
    {:else if !combinedPortfolio.marketCount}
      <div class="comparison-empty">Run an analysis with selected token markets to view portfolio statistics.</div>
    {:else}
      {@const detail = combinedPortfolioMetrics}
      <div class="analytics-detail-grid">
        <div class="analytics-stat-group">
          <h3>Portfolio value <small>starts at {formatCurrency(STARTING_BALANCE, 'USD')}</small></h3>
          <div><span>Current value</span><strong>{detail.currentValue === null ? 'Insufficient observations' : formatCurrency(detail.currentValue, 'USD')}</strong></div>
          <div><span>Portfolio index</span><strong>{detail.currentIndex === null ? 'Insufficient observations' : formatNumber(detail.currentIndex, 2)}</strong></div>
          <div><span>Highest value</span><strong>{detail.highestValue === null ? 'Insufficient observations' : formatCurrency(detail.highestValue, 'USD')}</strong></div>
          <div><span>Lowest value</span><strong>{detail.lowestValue === null ? 'Insufficient observations' : formatCurrency(detail.lowestValue, 'USD')}</strong></div>
          <div><span>Average value</span><strong>{detail.averageValue === null ? 'Insufficient observations' : formatCurrency(detail.averageValue, 'USD')}</strong></div>
        </div>
        <div class="analytics-stat-group">
          <h3>Strategy performance <small>{activeStrategy.name} · period</small></h3>
          <div><span>Absolute return</span><strong class={metricTone('return', detail.percentageReturn)}>{detail.absoluteReturn === null ? 'Insufficient observations' : formatCurrency(detail.absoluteReturn, 'USD')}</strong></div>
          <div><span>Percentage return</span><strong class={metricTone('return', detail.percentageReturn)}>{displayMetric(detail.percentageReturn)}%</strong></div>
          <div><span>Maximum drawdown</span><strong class={metricTone('drawdown', detail.maxDrawdown)}>{displayMetric(detail.maxDrawdown)}%</strong></div>
        </div>
        <div class="analytics-stat-group">
          <h3>Risk & activity <small>252-observation annualization; risk-free rate 0</small></h3>
          <div><span>Annualized volatility</span><strong class={metricTone('volatility', detail.annualizedVolatility)}>{detail.annualizedVolatility === null ? 'Insufficient observations' : `${displayMetric(detail.annualizedVolatility)}%`}</strong></div>
          <div><span>Sharpe ratio</span><strong class={metricTone('sharpe', detail.sharpeRatio)}>{displayMetric(detail.sharpeRatio, 3)}</strong></div>
          <div><span>Combined constituent USD volume</span><strong>{detail.totalDollarVolume === null
            ? 'Unavailable for one or more markets'
            : formatCurrency(detail.totalDollarVolume, 'USD')}</strong></div>
        </div>
      </div>
    {/if}
  </section>

    </div>
  <section class="analytics-statistics" aria-label="Selected market statistics">
    <div class="analytics-section-heading">
      <div>
        <h2>Market statistics</h2>
        <p>{selectedStrategyId === 'buy-and-hold' ? 'Buy & Hold' : activeStrategy.name} results for {startMonth} to {endMonth}.</p>
      </div>
      <div class="analytics-sort-controls" aria-label="Sort market results">
        <label class="analytics-sort-control" for="analytics-sort-metric">
          <span>SORT BY</span>
          <div class="select-wrap">
            <select id="analytics-sort-metric" bind:value={sortMetric}>
              <option value="percentageReturn">Return (%)</option>
              <option value="annualizedVolatility">Volatility</option>
              <option value="maxDrawdown">Drawdown</option>
              <option value="sharpeRatio">Sharpe</option>
            </select>
            <span class="select-chevron">⌄</span>
          </div>
        </label>
        <label class="analytics-sort-control" for="analytics-sort-direction">
          <span>ORDER</span>
          <div class="select-wrap">
            <select id="analytics-sort-direction" bind:value={sortDirection}>
              <option value="descending">Descending</option>
              <option value="ascending">Ascending</option>
            </select>
            <span class="select-chevron">⌄</span>
          </div>
        </label>
      </div>
    </div>
    {#if !analyticsResults.length}
      <div class="comparison-empty">Select markets above and run an analysis to view statistics.</div>
    {:else}
      <div class="analytics-stat-grid">
        {#each sortedAnalyticsResults as item (item.instrument.id)}
          {@const priceDigits = item.instrument.marketType === 'forex' ? 8 : 5}
        <button
          type="button"
            class="analytics-stat-card"
            class:analytics-stat-card-hovered={hoveredInstrumentId === item.instrument.id}
          class:analytics-stat-card-selected={chartFocusInstrumentId === item.instrument.id}
            style={`--market-color: ${colors[selectedInstruments.findIndex((market) => market.id === item.instrument.id) % colors.length]}`}
          aria-pressed={chartFocusInstrumentId === item.instrument.id}
          aria-label={`Toggle price chart for ${item.instrument.symbol}`}
            on:mouseenter={() => (hoveredInstrumentId = item.instrument.id)}
            on:mouseleave={() => (hoveredInstrumentId = null)}
          on:click={() => toggleChartFocus(item.instrument.id)}
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
            <div class="analytics-stat-summary">
              <div>
                <span>Last price</span>
                <strong>{item.metrics.lastPrice === null
                  ? 'Insufficient observations'
                  : `${formatNumber(item.metrics.lastPrice, priceDigits)} ${item.instrument.quoteCurrency}`}</strong>
              </div>
              <div>
                <span>{sortMetricLabel()}</span>
                <strong class={sortMetricTone(item.metrics)}>{displaySortMetric(item.metrics)}</strong>
              </div>
              </div>
            {/if}
          <span class="analytics-stat-card-hint">{chartFocusInstrumentId === item.instrument.id ? 'Price chart selected' : 'Click to view price chart'}</span>
        </button>
        {/each}
      </div>
    {/if}
  </section>
  </div>

  <footer class="page-footer">
    <span>Returns are strategy equity changes in each instrument’s quote currency.</span>
    <span>FX rates are daily ECB reference observations, not intraday prices.</span>
  </footer>
</div>
