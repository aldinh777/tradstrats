<script lang="ts">
  import {
    chartPaths,
    chartYLabels,
    formatCurrency,
    STARTING_BALANCE,
    type BacktestResult,
    type Candle,
  } from '../backtest'

  export let result: BacktestResult | null
  export let candles: Candle[]
  export let loading: boolean

  $: paths = result
    ? chartPaths(result.equity, result.benchmark)
    : { strategy: '', benchmark: '', fill: '' }
  $: yLabels = result ? chartYLabels(result.equity, result.benchmark) : []
</script>

<section class="chart-card">
  <div class="chart-header">
    <div>
      <h2>Equity curve</h2>
      <p>Portfolio value over time · starting balance {formatCurrency(STARTING_BALANCE)}</p>
    </div>
    <div class="chart-legend">
      <span><i class="legend-line strategy-line"></i> Strategy</span>
      <span><i class="legend-line benchmark-line"></i> Buy &amp; hold</span>
    </div>
  </div>
  <div class="chart-body">
    {#if loading && !result}
      <div class="chart-loading"><span class="spinner"></span> Fetching historical candles from Hyperliquid…</div>
    {:else if result && candles.length}
      <div class="chart-y-labels">{#each yLabels as label}<span>{formatCurrency(label)}</span>{/each}</div>
      <svg class="equity-chart" viewBox="0 0 960 310" preserveAspectRatio="none" role="img" aria-label="Strategy and buy and hold equity curve">
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#b9f277" stop-opacity=".16" />
            <stop offset="100%" stop-color="#b9f277" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path class="grid-line" d="M12 34H948 M12 118H948 M12 202H948 M12 286H948" />
        <path d={paths.fill} fill="url(#area-fill)" />
        <path d={paths.benchmark} class="chart-path benchmark-path" />
        <path d={paths.strategy} class="chart-path strategy-path" />
      </svg>
      <div class="chart-x-labels">
        <span>{new Date(candles[0].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(candles[Math.floor(candles.length / 2)].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(candles[candles.length - 1].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    {:else}
      <div class="chart-empty">Run a backtest to see your strategy performance.</div>
    {/if}
  </div>
  {#if result}
    <div class="chart-footer">
      <div><span class="footer-label">ENDING BALANCE</span><strong>{formatCurrency(result.finalBalance)}</strong></div>
      <div><span class="footer-label">STARTING BALANCE</span><strong>{formatCurrency(STARTING_BALANCE)}</strong></div>
      <div><span class="footer-label">CANDLES ANALYZED</span><strong>{candles.length.toLocaleString()}</strong></div>
      <div class="chart-footer-note">Past performance does not guarantee future results.</div>
    </div>
  {/if}
</section>
