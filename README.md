# tradstrats

A lightweight browser-based backtesting workspace for Hyperliquid perpetual markets. It loads market metadata and historical candles from Hyperliquid's public info API and runs registered strategies over the selected market history.

## Run locally

```sh
bun install
bun run dev
```

Run the Svelte and TypeScript checks with `bun run check`, or create a production build with `bun run build`.

## Backtest model

- Select a market, candle interval, and start/end month, then run the test. The end month includes data through the current time if it is the current month.
- Compare up to four strategies on the same market, timeframe, and date range.
- **Buy & hold** buys once at the first candle and holds through the end of the test.
- **DCA** invests an equal dollar amount on every candle and holds the purchases.
- **Trend following** holds when a candle closes above the previous close and exits to cash when it closes below.
- **Delayed trend following** enters after two consecutive higher closes and exits after two consecutive lower closes.
- **Value cost averaging** sizes a unit target from the first candle's close and buys an equal share of that target on every candle, subject to the remaining $10,000 budget.
- The default timeframe is one day and the default date range covers approximately six months. Each strategy result includes ending units owned, cash left, and total fees paid. A 0.05% fee is charged on each buy or sell.
- Candles are requested from the Hyperliquid `/info` endpoint using `meta` and `candleSnapshot` requests.

This is an educational historical simulation, not financial advice. It does not model funding payments, slippage, liquidation, or intrabar order execution, and it does not place live orders.

## Adding a strategy

Implement a `StrategyDefinition` in `src/lib/strategies/`, then add it to the `STRATEGIES` registry in `src/lib/strategies/index.ts`. The registry supplies both the comparison selector and backtest runner. The UI limits each comparison to four strategies.
