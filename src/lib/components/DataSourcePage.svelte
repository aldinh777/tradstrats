<script lang="ts">
  import type { MarketInstrument, ProviderCatalog, ProviderId } from '../data/types'

  export let catalogs: ProviderCatalog[]
  export let selectedInstrumentIds: string[]
  export let loading: boolean
  export let cacheMessage: string
  export let onToggleInstrument: (instrument: MarketInstrument) => void
  export let onRefresh: () => void
  export let onClearCache: () => void

  let search = ''
  let expandedProviderIds: ProviderId[] = []

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
</script>

<div class="page-content">
  <section class="page-heading">
    <div>
      <div class="eyebrow"><span class="eyebrow-line"></span> MARKET UNIVERSE</div>
      <h1>Data Source</h1>
      <p class="page-subtitle">Choose which provider markets are available in Backtesting and Analytics.</p>
    </div>
    <div class="source-actions">
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
        <p>Frankfurter lists USD-base pairs only: one US dollar expressed in the target currency.</p>
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
