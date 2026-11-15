<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    FEE_RATE,
    formatMonthRange,
    monthRangeTimestamps,
    STARTING_BALANCE,
    type Candle,
  } from './lib/backtest'
  import { historicalDataCache } from './lib/data/cache'
  import { DATA_PROVIDERS, getDataProvider } from './lib/data/providers'
  import {
    loadBacktestInstrumentId,
    loadInstrumentSelections,
    saveBacktestInstrumentId,
    saveInstrumentSelections,
  } from './lib/data/selection'
  import type { MarketInstrument, ProviderCatalog, WorkspacePage } from './lib/data/types'
  import { getStrategy, STRATEGY_OPTIONS } from './lib/strategies'
  import type { IdentifiedTradeOrder, StrategyComparison } from './lib/strategies/types'
  import AnalyticsPage from './lib/components/AnalyticsPage.svelte'
  import BacktestControls from './lib/components/BacktestControls.svelte'
  import DataSourcePage from './lib/components/DataSourcePage.svelte'
  import EquityChart from './lib/components/EquityChart.svelte'
  import MarketOverview from './lib/components/MarketOverview.svelte'
  import PriceChart from './lib/components/PriceChart.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import StrategyComparisonResults from './lib/components/StrategyComparisonResults.svelte'
  import TopBar from './lib/components/TopBar.svelte'
  import TradeHistory from './lib/components/TradeHistory.svelte'

  const now = new Date()
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const initialStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))
  const monthOptions: string[] = []
  for (let offset = 0; ; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    if (month < '2009-01') break
    monthOptions.push(month)
  }

  let providerCatalogs: ProviderCatalog[] = DATA_PROVIDERS.map((provider) => ({
    provider,
    instruments: [],
    error: '',
  }))
  let selectedInstruments: MarketInstrument[] = []
  let selectedInstrumentId = 'hyperliquid:BTC'
  let selectedInterval = '1d'
  let startMonth = `${initialStartDate.getUTCFullYear()}-${String(initialStartDate.getUTCMonth() + 1).padStart(2, '0')}`
  let endMonth = currentMonth
  let selectedStrategyIds = ['buy-and-hold', 'dca', 'n-candle-momentum-2']
  let candles: Candle[] = []
  let comparisons: StrategyComparison[] = []
  let hoveredStrategyId: string | null = null
  let activeStrategyId: string | null = null
  let hoveredOrder: IdentifiedTradeOrder | null = null
  let activePage: WorkspacePage = 'backtest'
  let sidebarCollapsed = false
  let loading = true
  let providersLoading = true
  let errorMessage = ''
  let selectionError = ''
  let lastUpdated = ''
  let cacheMessage = ''

  $: markets = selectedInstruments
  $: selectedInstrument = selectedInstruments.find((item) => item.id === selectedInstrumentId) ?? null
  $: timeframes = selectedInstrument ? getDataProvider(selectedInstrument.providerId).timeframes : []
  $: if (timeframes.length && !timeframes.some((timeframe) => timeframe.value === selectedInterval)) {
    selectedInterval = '1d'
  }
  $: periodLabel = startMonth && endMonth ? formatMonthRange(startMonth, endMonth) : 'Select a date range'
  $: highlightedStrategyId = hoveredStrategyId ?? activeStrategyId
  $: selectedStrategyId = highlightedStrategyId ?? comparisons[0]?.strategy.id ?? null

  async function refreshProviderCatalogs() {
    providersLoading = true
    cacheMessage = ''
    providerCatalogs = await Promise.all(DATA_PROVIDERS.map(async (provider) => {
      try {
        return { provider, instruments: await provider.listInstruments(), error: '' }
      } catch (error) {
        return {
          provider,
          instruments: [],
          error: error instanceof Error ? error.message : `Unable to load ${provider.name} markets.`,
        }
      }
    }))

    try {
      const saved = loadInstrumentSelections()
      if (saved.exists) {
        selectedInstruments = saved.instruments.flatMap((instrument) => {
          const catalog = providerCatalogs.find((item) => item.provider.id === instrument.providerId)
          if (!catalog || catalog.error) return [instrument]
          const available = catalog.instruments.find((item) => item.id === instrument.id)
          if (instrument.providerId === 'frankfurter') return available ? [available] : []
          return [available ?? instrument]
        })
        if (selectedInstruments.length !== saved.instruments.length) {
          saveInstrumentSelections(selectedInstruments)
        }
      } else {
        const bitcoin = providerCatalogs
          .flatMap((catalog) => catalog.instruments)
          .find((instrument) => instrument.id === 'hyperliquid:BTC')
        selectedInstruments = bitcoin ? [bitcoin] : []
        if (bitcoin) saveInstrumentSelections(selectedInstruments)
      }

      const savedBacktestId = loadBacktestInstrumentId()
      const preferredId = savedBacktestId && selectedInstruments.some((item) => item.id === savedBacktestId)
        ? savedBacktestId
        : selectedInstruments[0]?.id
      if (preferredId) selectedInstrumentId = preferredId
      if (selectedInstruments.length && !preferredId) selectedInstrumentId = selectedInstruments[0].id
    } catch (error) {
      selectionError = error instanceof Error ? error.message : 'Unable to load saved market selections.'
    } finally {
      providersLoading = false
      loading = false
    }

    if (selectedInstrumentId && selectedInstruments.length) {
      await tick()
      await runBacktest()
    }
  }

  function toggleInstrument(instrument: MarketInstrument) {
    const isSelected = selectedInstruments.some((item) => item.id === instrument.id)
    const nextInstruments = isSelected
      ? selectedInstruments.filter((item) => item.id !== instrument.id)
      : [...selectedInstruments, instrument]
    try {
      saveInstrumentSelections(nextInstruments)
      selectedInstruments = nextInstruments
      selectionError = ''
    } catch (error) {
      selectionError = error instanceof Error ? error.message : 'Unable to save market selections.'
      return
    }

    if (isSelected && selectedInstrumentId === instrument.id) {
      selectedInstrumentId = selectedInstruments[0]?.id ?? ''
      if (selectedInstrumentId) saveBacktestInstrumentId(selectedInstrumentId)
      else {
        candles = []
        comparisons = []
        errorMessage = 'Select a market in Data Source before running a backtest.'
      }
    }
  }

  function selectBacktestInstrument(instrumentId: string) {
    selectedInstrumentId = instrumentId
    selectedInterval = '1d'
    saveBacktestInstrumentId(instrumentId)
  }

  async function runBacktest(refresh = false) {
    if (!selectedInstrument) {
      errorMessage = 'Select a market in Data Source before running the backtest.'
      return
    }
    if (!startMonth || !endMonth || startMonth > endMonth) {
      errorMessage = 'Start month must be before or equal to end month.'
      return
    }
    if (!selectedStrategyIds.length) {
      errorMessage = 'Select at least one strategy to compare.'
      return
    }
    loading = true
    errorMessage = ''

    try {
      const loadedCandles = await historicalDataCache.getCandles(
        selectedInstrument,
        selectedInterval,
        monthRangeTimestamps(startMonth, endMonth),
        { refresh },
      )
      if (loadedCandles.length < 2) {
        throw new Error(`Only ${loadedCandles.length} observations were returned. Choose a longer date range.`)
      }
      const nextComparisons = selectedStrategyIds.map((id) => {
        const strategy = getStrategy(id)
        return {
          strategy,
          result: strategy.run(loadedCandles, {
            startingBalance: STARTING_BALANCE,
            feeRate: FEE_RATE,
          }),
        }
      })

      candles = loadedCandles
      comparisons = nextComparisons
      lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to load historical market data.'
    } finally {
      loading = false
    }
  }

  async function clearHistoricalCache() {
    try {
      await historicalDataCache.clear()
      cacheMessage = 'Historical data cache cleared. Saved market selections were not changed.'
    } catch (error) {
      cacheMessage = error instanceof Error ? error.message : 'Unable to clear the historical data cache.'
    }
  }

  onMount(() => {
    void refreshProviderCatalogs()
  })
</script>

<svelte:head>
  <title>tradstrats — Market Research</title>
  <meta
    name="description"
    content="Compare historical crypto and foreign-exchange market strategies."
  />
</svelte:head>

<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed}>
  <Sidebar
    connected={providerCatalogs.some((catalog) => catalog.instruments.length > 0)}
    {activePage}
    onNavigate={(page) => (activePage = page)}
  />

  <main id="workspace">
    <TopBar
      {sidebarCollapsed}
      {activePage}
      onToggleSidebar={() => (sidebarCollapsed = !sidebarCollapsed)}
    />

    {#if activePage === 'backtest'}
      <div class="page-content" id="backtest">
        <section class="page-heading">
          <div>
            <div class="eyebrow"><span class="eyebrow-line"></span> STRATEGY RESEARCH</div>
            <h1>Backtest</h1>
            <p class="page-subtitle">Test your edge against historical market data.</p>
          </div>
          <div class="heading-meta">
            <span class="updated-label">LAST RUN</span>
            <span class="updated-value">{lastUpdated || '—'}</span>
          </div>
        </section>

        {#if selectionError}<div class="error-banner" role="alert">{selectionError}</div>{/if}
        <BacktestControls
          {markets}
          {selectedInstrumentId}
          quoteCurrency={selectedInstrument?.quoteCurrency ?? 'USD'}
          {timeframes}
          onSelectInstrument={selectBacktestInstrument}
          strategies={STRATEGY_OPTIONS}
          bind:selectedInterval
          bind:startMonth
          bind:endMonth
          {monthOptions}
          bind:selectedStrategyIds
          {loading}
          {errorMessage}
          onRun={() => runBacktest()}
        />

        {#if selectedInstrument}
          <MarketOverview
            instrument={selectedInstrument}
            interval={selectedInterval}
            {candles}
            {loading}
          />
          <StrategyComparisonResults
            {comparisons}
            {loading}
            {periodLabel}
            quoteCurrency={selectedInstrument.quoteCurrency}
            {hoveredStrategyId}
            {activeStrategyId}
            onHover={(strategyId) => (hoveredStrategyId = strategyId)}
            onToggleActive={(strategyId) => {
              activeStrategyId = activeStrategyId === strategyId ? null : strategyId
            }}
          />
          <EquityChart
            {comparisons}
            {candles}
            {loading}
            {highlightedStrategyId}
            currency={selectedInstrument.quoteCurrency}
          />
          <PriceChart
            instrument={selectedInstrument}
            interval={selectedInterval}
            {comparisons}
            {candles}
            {loading}
            {highlightedStrategyId}
            {hoveredOrder}
            onHoverOrder={(order) => (hoveredOrder = order)}
          />
          <TradeHistory
            {comparisons}
            coin={selectedInstrument.baseCurrency}
            quoteCurrency={selectedInstrument.quoteCurrency}
            marketType={selectedInstrument.marketType}
            {selectedStrategyId}
            {hoveredOrder}
            onHoverOrder={(order) => (hoveredOrder = order)}
          />
        {:else}
          <div class="comparison-empty page-empty">Select at least one ticker from Data Source to configure a backtest.</div>
        {/if}

        <footer class="page-footer">
          <span>Built for systematic thinkers.</span>
          <span>Historical simulations only · No live orders are placed</span>
        </footer>
      </div>
    {:else if activePage === 'sources'}
      <DataSourcePage
        catalogs={providerCatalogs}
        selectedInstrumentIds={selectedInstruments.map((instrument) => instrument.id)}
        loading={providersLoading}
        {cacheMessage}
        onToggleInstrument={toggleInstrument}
        onRefresh={refreshProviderCatalogs}
        onClearCache={clearHistoricalCache}
      />
    {:else}
      <AnalyticsPage instruments={selectedInstruments} {monthOptions} />
    {/if}
  </main>
</div>
