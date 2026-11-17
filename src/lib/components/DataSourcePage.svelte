<script lang="ts">
  import type {
    CachedSeriesSummary,
    MarketInstrument,
    ProviderCatalog,
    ProviderId,
  } from '../data/types'
  import type { Candle } from '../strategies/types'

  export let catalogs: ProviderCatalog[]
  export let selectedInstrumentIds: string[]
  export let loading: boolean
  export let cacheMessage: string
  export let cachedSeries: CachedSeriesSummary[]
  export let cacheSeriesLoading: boolean
  export let cacheSeriesError: string
  export let inspectedCacheKey: string | null
  export let inspectedCacheCandles: Candle[]
  export let cacheCandlesLoading: boolean
  export let onToggleInstrument: (instrument: MarketInstrument) => void
  export let onRefresh: () => void
  export let onClearCache: () => void
  export let onRefreshCache: () => void
  export let onInspectCache: (key: string) => void

  let search = ''
  let expandedProviderIds: ProviderId[] = []
  let cacheInspectorOpen = false
  let candlePage = 0
  const candlesPerPage = 50

  $: query = search.trim().toLowerCase()
  $: visibleCatalogs = catalogs.map((catalog) => ({
    ...catalog,
    instruments: catalog.instruments.filter((instrument) =>
      `${instrument.symbol} ${instrument.name} ${instrument.baseCurrency} ${instrument.quoteCurrency}`
        .toLowerCase()
        .includes(query),
    ),
  }))
  $: if (query) {
    expandedProviderIds = visibleCatalogs
      .filter((catalog) => catalog.instruments.length > 0)
      .map((catalog) => catalog.provider.id)
  }

  function toggleProvider(providerId: ProviderId) {
    expandedProviderIds = expandedProviderIds.includes(providerId)
      ? expandedProviderIds.filter((id) => id !== providerId)
      : [...expandedProviderIds, providerId]
  }
  $: allInstruments = catalogs.flatMap((catalog) => catalog.instruments)
  $: inspectedSeries = cachedSeries.find((series) => series.key === inspectedCacheKey) ?? null
  $: candlePageCount = Math.max(1, Math.ceil(inspectedCacheCandles.length / candlesPerPage))
  $: candlePage = Math.min(candlePage, candlePageCount - 1)
  $: visibleCachedCandles = inspectedCacheCandles.slice(
    candlePage * candlesPerPage,
    (candlePage + 1) * candlesPerPage,
  )

  function toggleCacheInspector() {
    cacheInspectorOpen = !cacheInspectorOpen
    if (cacheInspectorOpen) onRefreshCache()
  }

  function selectCachedSeries(key: string) {
    candlePage = 0
    onInspectCache(key)
  }

  function dateLabel(timestamp: number | null): string {
    return timestamp === null ? '—' : new Date(timestamp).toISOString().slice(0, 10)
  }

  function numberLabel(value: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value)
  }
</script>

<div class="page-content">
  <section class="page-heading">
    <div>
      <div class="eyebrow"><span class="eyebrow-line"></span> MARKET UNIVERSE</div>
      <h1>Data Source</h1>
      <p class="page-subtitle">Choose which provider markets are available in Backtesting and Analytics.</p>
    </div>
    <div class="source-actions">
      <button
        class="secondary-button"
        type="button"
        aria-expanded={cacheInspectorOpen}
        on:click={toggleCacheInspector}
      >
        {cacheInspectorOpen ? 'Hide cached candles' : 'View cached candles'}
      </button>
      <button class="secondary-button" type="button" on:click={onRefresh} disabled={loading}>
        {loading ? 'Loading providers…' : 'Refresh providers'}
      </button>
      <button class="secondary-button" type="button" on:click={onClearCache}>
        Clear historical cache
      </button>
    </div>
  </section>

  {#if cacheMessage}
    <div class="success-banner" role="status">{cacheMessage}</div>
  {/if}

  {#if cacheInspectorOpen}
    <section class="cache-inspector" aria-label="Cached historical candles">
      <div class="cache-inspector-heading">
        <div>
          <h2>Cached historical data</h2>
          <p>Stored candles and covered date ranges in this browser’s IndexedDB.</p>
        </div>
        <button class="secondary-button" type="button" on:click={onRefreshCache} disabled={cacheSeriesLoading}>
          {cacheSeriesLoading ? 'Refreshing…' : 'Refresh cache list'}
        </button>
      </div>
      {#if cacheSeriesError}
        <div class="error-banner" role="alert">{cacheSeriesError}</div>
      {/if}
      {#if cacheSeriesLoading && !cachedSeries.length}
        <div class="source-empty">Reading local cache…</div>
      {:else if !cachedSeries.length}
        <div class="source-empty">No historical candles are cached yet.</div>
      {:else}
        <div class="cache-inspector-layout">
          <div class="cache-series-list" aria-label="Cached market series">
            {#each cachedSeries as series (series.key)}
              {@const instrument = allInstruments.find((item) => item.id === series.instrumentId)}
              <button
                type="button"
                class="cache-series-item"
                class:cache-series-item-selected={inspectedCacheKey === series.key}
                aria-pressed={inspectedCacheKey === series.key}
                on:click={() => selectCachedSeries(series.key)}
              >
                <strong>{instrument?.symbol ?? series.instrumentId}</strong>
                <span>{series.providerId} · {series.interval}</span>
                <small>{series.candleCount.toLocaleString()} candles · {dateLabel(series.firstTimestamp)} – {dateLabel(series.lastTimestamp)}</small>
              </button>
            {/each}
          </div>
          <div class="cache-series-details">
            {#if !inspectedSeries}
              <div class="source-empty">Choose a cached series to inspect its candles.</div>
            {:else}
              {@const instrument = allInstruments.find((item) => item.id === inspectedSeries.instrumentId)}
              <div class="cache-series-detail-heading">
                <div>
                  <h3>{instrument?.symbol ?? inspectedSeries.instrumentId} <span>{inspectedSeries.interval}</span></h3>
                  <p>{inspectedSeries.candleCount.toLocaleString()} stored candles · {inspectedSeries.providerId}</p>
                </div>
                {#if inspectedCacheCandles.length > candlesPerPage}
                  <div class="cache-pagination" aria-label="Candle table pages">
                    <button type="button" class="secondary-button" on:click={() => (candlePage -= 1)} disabled={candlePage === 0}>Previous</button>
                    <span>{candlePage + 1} / {candlePageCount}</span>
                    <button type="button" class="secondary-button" on:click={() => (candlePage += 1)} disabled={candlePage + 1 >= candlePageCount}>Next</button>
                  </div>
                {/if}
              </div>
              <div class="cache-coverage">
                <strong>Cached coverage</strong>
                {#if inspectedSeries.coverage.length}
                  {#each inspectedSeries.coverage as range}
                    <span>{dateLabel(range.startTime)} – {dateLabel(range.endTime)} · refreshed {new Date(range.fetchedAt).toLocaleString()}</span>
                  {/each}
                {:else}
                  <span>No coverage metadata is stored.</span>
                {/if}
              </div>
              {#if cacheCandlesLoading}
                <div class="source-empty">Loading cached candles…</div>
              {:else if !inspectedCacheCandles.length}
                <div class="source-empty">This series has coverage metadata but no candle records.</div>
              {:else}
                <div class="cache-candle-table-wrap">
                  <table class="cache-candle-table">
                    <thead>
                      <tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr>
                    </thead>
                    <tbody>
                      {#each visibleCachedCandles as candle (candle.t)}
                        <tr>
                          <td>{dateLabel(candle.t)}</td>
                          <td>{numberLabel(candle.o)}</td>
                          <td>{numberLabel(candle.h)}</td>
                          <td>{numberLabel(candle.l)}</td>
                          <td>{numberLabel(candle.c)}</td>
                          <td>{candle.v === null ? '—' : numberLabel(candle.v)}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <section class="source-provider-summary" aria-label="Available providers">
    {#each catalogs as catalog}
      <article class="source-provider-card">
        <div class="source-provider-heading">
          <span class="provider-icon">{catalog.provider.id === 'hyperliquid' ? 'H' : 'FX'}</span>
          <div>
            <strong>{catalog.provider.name}</strong>
            <span>{catalog.instruments.length.toLocaleString()} available tickers</span>
          </div>
        </div>
        <p>{catalog.provider.description}</p>
        <div class="source-provider-footer">
          <span>{selectedInstrumentIds.filter((id) => id.startsWith(`${catalog.provider.id}:`)).length} selected</span>
          {#if catalog.error}<span class="source-provider-error">{catalog.error}</span>{/if}
        </div>
        <button
          class="source-expand-button"
          type="button"
          aria-expanded={expandedProviderIds.includes(catalog.provider.id)}
          on:click={() => toggleProvider(catalog.provider.id)}
        >
          {expandedProviderIds.includes(catalog.provider.id) ? 'Collapse markets' : 'Expand markets'}
          <span aria-hidden="true">{expandedProviderIds.includes(catalog.provider.id) ? '−' : '+'}</span>
        </button>
      </article>
    {/each}
  </section>

  <section class="source-catalog-panel" aria-label="Browse and select tickers">
    <div class="source-catalog-heading">
      <div>
        <h2>Available markets</h2>
        <p>Frankfurter lists currency/USD pairs: one unit of foreign currency expressed in US dollars.</p>
      </div>
      <label class="source-search">
        <span>SEARCH</span>
        <input bind:value={search} type="search" placeholder="Search tickers or currencies" />
      </label>
    </div>

    {#each visibleCatalogs as catalog}
      {#if expandedProviderIds.includes(catalog.provider.id)}
      <div class="source-list-section" id={`source-list-${catalog.provider.id}`}>
        <div class="source-list-title">
          <span>{catalog.provider.name}</span>
          <span>{catalog.instruments.length.toLocaleString()} shown</span>
        </div>
        {#if catalog.error && !catalog.instruments.length}
          <div class="source-empty">{catalog.error}</div>
        {:else if !catalog.instruments.length}
          <div class="source-empty">
            {loading ? 'Loading available tickers…' : query ? 'No matching tickers.' : 'No tickers available.'}
          </div>
        {:else}
          <div class="source-market-grid">
            {#each catalog.instruments as instrument (instrument.id)}
              {@const selected = selectedInstrumentIds.includes(instrument.id)}
              <button
                class="source-market-card"
                class:source-market-selected={selected}
                type="button"
                aria-pressed={selected}
                on:click={() => onToggleInstrument(instrument)}
              >
                <span class="source-market-check">{selected ? '✓' : '+'}</span>
                <span class="source-market-main">
                  <strong>{instrument.symbol}</strong>
                  <span>{instrument.name}</span>
                  <small>
                    {instrument.marketType === 'forex'
                      ? `1 ${instrument.baseCurrency} quoted in ${instrument.quoteCurrency}`
                      : `${instrument.baseCurrency} perpetual · USD quote`}
                  </small>
                </span>
                <span class="source-market-provider">{catalog.provider.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      {/if}
    {/each}
    {#if !expandedProviderIds.length}
      <div class="source-empty">
        {query ? 'No matching tickers.' : 'Expand Hyperliquid or Frankfurter to browse available tickers.'}
      </div>
    {/if}
  </section>

  <footer class="page-footer">
    <span>Selections are saved in this browser.</span>
    <span>Historical observations are stored locally in IndexedDB.</span>
  </footer>
</div>
