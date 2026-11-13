<script lang="ts">
  export let connected: boolean
</script>

<aside class="sidebar">
  <a class="brand" href="#workspace" aria-label="tradstrats home">
    <span class="brand-mark"><span></span><span></span><span></span></span>
    <span>tradstrats</span>
  </a>

  <div class="workspace-label">WORKSPACE</div>
  <nav aria-label="Main navigation">
    <a class="nav-item active" href="#backtest">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15.5 7.2 11l3 2.8 6.8-8" /><path d="M12.5 5.8H17v4.5" /></svg>
      <span>Backtest</span>
      <span class="nav-current"></span>
    </a>
    <a class="nav-item" href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api" target="_blank" rel="noreferrer">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h8l4 4v9H4z" /><path d="M12 3.5v4h4M7 11h6M7 14h6" /></svg>
      <span>Data source</span>
      <svg class="external-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h4v4M13 3 7 9" /><path d="M11 9v4H3V5h4" /></svg>
    </a>
  </nav>

  <div class="sidebar-spacer"></div>
  <div class="data-card">
    <div class="data-card-top"><span class="live-dot"></span> DATA CONNECTION</div>
    <strong>Hyperliquid</strong>
    <span class="data-card-caption">Perpetual markets · Mainnet</span>
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
