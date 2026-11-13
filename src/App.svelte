<script lang="ts">
  import { onMount } from 'svelte'
  import {
    calculateSmaCrossover,
    DATE_RANGES,
    fetchCandles,
    fetchMarkets,
    type BacktestResult,
    type Candle,
  } from './lib/backtest'
  import BacktestControls from './lib/components/BacktestControls.svelte'
  import EquityChart from './lib/components/EquityChart.svelte'
  import MarketOverview from './lib/components/MarketOverview.svelte'
  import MetricsGrid from './lib/components/MetricsGrid.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import TopBar from './lib/components/TopBar.svelte'

  let markets: string[] = []
  let selectedCoin = 'BTC'
  let selectedInterval = '4h'
  let selectedRange = 90
  let fastPeriod = 20
  let slowPeriod = 50
  let candles: Candle[] = []
  let result: BacktestResult | null = null
  let loading = true
  let errorMessage = ''
  let lastUpdated = ''

  async function runBacktest() {
    if (!selectedCoin || fastPeriod < 1 || slowPeriod <= fastPeriod) {
      errorMessage = 'Choose a market and make sure the slow period is greater than the fast period.'
      return
    }

    loading = true
    errorMessage = ''

    try {
      const loadedCandles = await fetchCandles(
        selectedCoin,
        selectedInterval,
        selectedRange,
        slowPeriod,
      )
      candles = loadedCandles
      result = calculateSmaCrossover(loadedCandles, fastPeriod, slowPeriod)
      lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to load market data.'
    } finally {
      loading = false
    }
  }

  $: periodLabel = DATE_RANGES.find((range) => range.days === selectedRange)?.label ?? '90 days'

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

<div class="app-shell">
  <Sidebar connected={!!lastUpdated} />

  <main id="workspace">
    <TopBar />

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
        bind:selectedRange
        bind:fastPeriod
        bind:slowPeriod
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
      <MetricsGrid {result} {loading} coin={selectedCoin} {periodLabel} />
      <EquityChart {result} {candles} {loading} />

      <footer class="page-footer">
        <span>Built for systematic thinkers.</span>
        <span>Historical simulations only · No live orders are placed</span>
      </footer>
    </div>
  </main>
</div>
