<script lang="ts">
  import type { WorkspacePage } from '../data/types'

  export let sidebarCollapsed: boolean
  export let onToggleSidebar: () => void
  export let activePage: WorkspacePage

  $: pageTitle = activePage === 'backtest'
    ? 'Backtesting'
    : activePage === 'sources'
      ? 'Data Source'
      : 'Analytics'
</script>

<header class="topbar">
  <div class="topbar-left">
    <button
      class="sidebar-toggle"
      type="button"
      aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-expanded={!sidebarCollapsed}
      aria-controls="app-sidebar"
      title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      on:click={onToggleSidebar}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    </button>
    <div class="breadcrumb"><span>Workspace</span><span class="crumb-slash">/</span><strong>{pageTitle}</strong></div>
  </div>
  <div class="topbar-right">
    <span class="environment"><span class="live-dot"></span> HISTORICAL DATA · NO LIVE ORDERS</span>
    <button class="help-button" aria-label="About this backtester" title="Historical data only. No live orders are placed.">?</button>
  </div>
</header>
