# tradstrats

A lightweight browser-based backtesting workspace for Hyperliquid perpetual markets. It loads market metadata and historical candles from Hyperliquid's public info API, then compares a simple moving-average crossover strategy with buy-and-hold.

## Run locally

```sh
bun install
bun run dev
```

Run the Svelte and TypeScript checks with `bun run check`, or create a production build with `bun run build`.

## Backtest model

- Select a market, candle interval, and historical date range, then run the test.
- The strategy enters when the fast simple moving average crosses above the slow average, and exits when it crosses below.
- The default periods are 20 and 50 candles. The starting balance is $10,000.
- A 0.05% fee is charged on entry and exit. Buy-and-hold is shown as a comparison.
- Candles are requested from the Hyperliquid `/info` endpoint using `meta` and `candleSnapshot` requests.

This is an educational historical simulation, not financial advice. It does not model funding payments, slippage, liquidation, or intrabar order execution, and it does not place live orders.
