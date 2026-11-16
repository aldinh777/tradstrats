<script lang="ts">
  import type { WorkspacePage } from '../data/types'

  export let connected: boolean
  export let activePage: WorkspacePage
  export let onNavigate: (page: WorkspacePage) => void
</script>

<aside class="sidebar" id="app-sidebar">
  <a class="brand" href="#workspace" aria-label="tradstrats home">
    <span class="brand-mark"><span></span><span></span><span></span></span>
    <span>tradstrats</span>
  </a>

  <div class="workspace-label">WORKSPACE</div>
  <nav aria-label="Main navigation">
    <a class="nav-item" class:active={activePage === 'analytics'} href="#analytics" on:click|preventDefault={() => onNavigate('analytics')}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 16.5h14M5 14V9M10 14V5M15 14V7" /></svg>
      <span>Analytics</span>
      {#if activePage === 'analytics'}<span class="nav-current"></span>{/if}
    </a>
    <a class="nav-item" class:active={activePage === 'backtest'} href="#backtest" on:click|preventDefault={() => onNavigate('backtest')}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15.5 7.2 11l3 2.8 6.8-8" /><path d="M12.5 5.8H17v4.5" /></svg>
      <span>Backtesting</span>
      {#if activePage === 'backtest'}<span class="nav-current"></span>{/if}
    </a>
    <a class="nav-item" class:active={activePage === 'sources'} href="#data-source" on:click|preventDefault={() => onNavigate('sources')}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h8l4 4v9H4z" /><path d="M12 3.5v4h4M7 11h6M7 14h6" /></svg>
      <span>Data Source</span>
      {#if activePage === 'sources'}<span class="nav-current"></span>{/if}
    </a>
  </nav>

  <div class="sidebar-spacer"></div>
  <div class="data-card">
    <div class="data-card-top"><span class="live-dot"></span> DATA PROVIDERS</div>
    <strong>Multi-source</strong>
    <span class="data-card-caption">Hyperliquid · Frankfurter</span>
    <div class="data-card-footer">
      <span>API status</span>
      <span class:connected={connected}>{connected ? 'Connected' : 'Connecting'}</span>
    </div>
  </div>
  <div class="sidebar-footer">
    <span class="avatar">S</span>
    <span class="profile-name">Strategy lab</span>
    <button class="more-button" aria-label="Workspace options">···</button>
  </div>
</aside>

<nav class="mobile-bottom-nav" aria-label="Mobile navigation">
  <a class="nav-item" class:active={activePage === 'analytics'} href="#analytics" on:click|preventDefault={() => onNavigate('analytics')}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 16.5h14M5 14V9M10 14V5M15 14V7" /></svg>
    <span>Analytics</span>
    {#if activePage === 'analytics'}<span class="nav-current"></span>{/if}
  </a>
  <a class="nav-item" class:active={activePage === 'backtest'} href="#backtest" on:click|preventDefault={() => onNavigate('backtest')}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15.5 7.2 11l3 2.8 6.8-8" /><path d="M12.5 5.8H17v4.5" /></svg>
    <span>Backtesting</span>
    {#if activePage === 'backtest'}<span class="nav-current"></span>{/if}
  </a>
  <a class="nav-item" class:active={activePage === 'sources'} href="#data-source" on:click|preventDefault={() => onNavigate('sources')}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h8l4 4v9H4z" /><path d="M12 3.5v4h4M7 11h6M7 14h6" /></svg>
    <span>Data Source</span>
    {#if activePage === 'sources'}<span class="nav-current"></span>{/if}
  </a>
</nav>
