<script lang="ts">
  import { onMount } from 'svelte'
  import {
    FEE_RATE,
    formatMonthRange,
    fetchCandles,
    fetchMarkets,
    STARTING_BALANCE,
    type Candle,
  } from './lib/backtest'
  import { getStrategy, STRATEGY_OPTIONS } from './lib/strategies'
  import type { IdentifiedTradeOrder, StrategyComparison } from './lib/strategies/types'
  import BacktestControls from './lib/components/BacktestControls.svelte'
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

  let markets: string[] = []
  let selectedCoin = 'BTC'
  let selectedInterval = '1d'
  let startMonth = `${initialStartDate.getUTCFullYear()}-${String(initialStartDate.getUTCMonth() + 1).padStart(2, '0')}`
  let endMonth = currentMonth
  let selectedStrategyIds = [
    'buy-and-hold',
    'dca',
    'n-candle-momentum-2',
  ]
  let candles: Candle[] = []
  let comparisons: StrategyComparison[] = []
  let hoveredStrategyId: string | null = null
  let activeStrategyId: string | null = null
  let hoveredOrder: IdentifiedTradeOrder | null = null
  let sidebarCollapsed = false
  let loading = true
  let errorMessage = ''
  let lastUpdated = ''

  async function runBacktest() {
    if (!selectedCoin) {
      errorMessage = 'Choose a market before running the backtest.'
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
      const loadedCandles = await fetchCandles(selectedCoin, selectedInterval, startMonth, endMonth)
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
      errorMessage = error instanceof Error ? error.message : 'Unable to load market data.'
    } finally {
      loading = false
    }
  }

  $: periodLabel = startMonth && endMonth ? formatMonthRange(startMonth, endMonth) : 'Select a date range'
  $: highlightedStrategyId = hoveredStrategyId ?? activeStrategyId
  $: selectedStrategyId = highlightedStrategyId ?? comparisons[0]?.strategy.id ?? null
  onMount(async () => {
    try {
      markets = await fetchMarkets()
      if (!markets.includes(selectedCoin) && markets.length) selectedCoin = markets[0]
      await runBacktest()
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to connect to Hyperliquid.'
      loading = false
    }
  })
</script>

<svelte:head>
  <title>tradstrats — Hyperliquid Backtesting</title>
  <meta
    name="description"
    content="Backtest crypto trading strategies using historical Hyperliquid market data."
  />
</svelte:head>

<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed}>
  <Sidebar connected={!!lastUpdated} />

  <main id="workspace">
    <TopBar
      {sidebarCollapsed}
      onToggleSidebar={() => (sidebarCollapsed = !sidebarCollapsed)}
    />

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

      <BacktestControls
        {markets}
        bind:selectedCoin
        bind:selectedInterval
        bind:startMonth
        bind:endMonth
        {monthOptions}
        strategies={STRATEGY_OPTIONS}
        bind:selectedStrategyIds
        {loading}
        {errorMessage}
        onRun={runBacktest}
      />

      <MarketOverview
        coin={selectedCoin}
        interval={selectedInterval}
        {candles}
        {loading}
      />
      <StrategyComparisonResults
        {comparisons}
        {loading}
        {periodLabel}
        coin={selectedCoin}
        {hoveredStrategyId}
        {activeStrategyId}
        onHover={(strategyId) => (hoveredStrategyId = strategyId)}
        onToggleActive={(strategyId) => {
          activeStrategyId = activeStrategyId === strategyId ? null : strategyId
        }}
      />
      <EquityChart {comparisons} {candles} {loading} {highlightedStrategyId} />
      <PriceChart
        coin={selectedCoin}
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
        coin={selectedCoin}
        {selectedStrategyId}
        {hoveredOrder}
        onHoverOrder={(order) => (hoveredOrder = order)}
      />

      <footer class="page-footer">
        <span>Built for systematic thinkers.</span>
        <span>Historical simulations only · No live orders are placed</span>
      </footer>
    </div>
  </main>
</div>
