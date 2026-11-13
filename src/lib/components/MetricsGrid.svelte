<script lang="ts">
  import { formatPercent, type BacktestResult } from '../backtest'

  export let result: BacktestResult | null
  export let loading: boolean
  export let coin: string
  export let periodLabel: string
</script>

<section class="metrics-grid" aria-label="Backtest results">
  <article class="metric-card primary-metric">
    <div class="metric-label">STRATEGY RETURN <span class="metric-info" title="Net return after estimated trading fees">i</span></div>
    <div class="metric-value" class:positive={!!result && result.totalReturn >= 0} class:negative={!!result && result.totalReturn < 0}>
      {#if loading && !result}<span class="skeleton skeleton-number"></span>{:else if result}{formatPercent(result.totalReturn)}{:else}—{/if}
    </div>
    <div class="metric-foot"><span class="metric-indicator green-indicator"></span> SMA crossover <span class="foot-separator">·</span> {periodLabel}</div>
  </article>
  <article class="metric-card">
    <div class="metric-label">BUY &amp; HOLD <span class="metric-info" title="Market return over the same period">i</span></div>
    <div class="metric-value" class:positive={!!result && result.benchmarkReturn >= 0} class:negative={!!result && result.benchmarkReturn < 0}>
      {#if loading && !result}<span class="skeleton skeleton-number"></span>{:else if result}{formatPercent(result.benchmarkReturn)}{:else}—{/if}
    </div>
    <div class="metric-foot"><span class="metric-indicator gray-indicator"></span> {coin} spot performance</div>
  </article>
  <article class="metric-card">
    <div class="metric-label">MAX DRAWDOWN <span class="metric-info" title="Largest peak-to-trough decline in strategy equity">i</span></div>
    <div class="metric-value drawdown-value">{#if loading && !result}<span class="skeleton skeleton-number"></span>{:else if result}{result.maxDrawdown.toFixed(2)}%{:else}—{/if}</div>
    <div class="metric-foot"><span class="metric-indicator amber-indicator"></span> Peak-to-trough</div>
  </article>
  <article class="metric-card">
    <div class="metric-label">WIN RATE <span class="metric-info" title="Profitable closed trades divided by all closed trades">i</span></div>
    <div class="metric-value">{#if loading && !result}<span class="skeleton skeleton-number"></span>{:else if result}{result.winRate.toFixed(1)}%{:else}—{/if}</div>
    <div class="metric-foot"><span class="metric-indicator blue-indicator"></span> {result?.trades ?? 0} total trades</div>
  </article>
</section>
