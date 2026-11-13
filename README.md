# tradstrats

A lightweight browser-based backtesting workspace for Hyperliquid perpetual markets. It loads market metadata and historical candles from Hyperliquid's public info API and runs registered strategies over the selected market history.

## Run locally

```sh
bun install
bun run dev
```

Run the strategy tests with `bun run test`, Svelte and TypeScript checks with `bun run check`, or create a production build with `bun run build`.

## Backtest model

- Select a market, candle interval, and start/end month, then run the test. The end month includes data through the current time if it is the current month.
- Available timeframes are 12 hours, 1 day, 3 days, 7 days, and 1 month. Weekly and monthly candles use Hyperliquid's native intervals.
- Compare any number of registered strategies on the same market, timeframe, and date range.
- **Passive Investing:** Buy & Hold purchases at the first candle's open and holds through the test.
- **Systematic Investing:** Dollar Cost Averaging invests a fixed USD amount per candle; Value Averaging adjusts holdings toward a linearly increasing portfolio-value target; Fixed-Quantity DCA buys a fixed quantity per candle calculated from the initial open and starting balance.
- **Momentum Trading:** Compare separate 1- through 7-Candle Momentum strategies. Each enters after N consecutive bullish candles and exits after N consecutive bearish candles.
- Strategy orders based on candle data execute at the next candle's open after the signal candle closes. Systematic purchases are also placed at candle opens; orders are limited by the starting cash balance.
- The default timeframe is one day and the default date range covers approximately six months. Each strategy result includes ending units owned, cash left, and total fees paid. A 0.05% fee is charged on each buy or sell.
- Candles are requested from the Hyperliquid `/info` endpoint using `meta` and `candleSnapshot` requests.

This is an educational historical simulation, not financial advice. It does not model funding payments, slippage, liquidation, or intrabar order execution, and it does not place live orders.

## Adding a strategy

Implement a `StrategyDefinition` in `src/lib/strategies/`, assign it to a `StrategyCategory`, then add it to the `STRATEGIES` registry in `src/lib/strategies/index.ts`. The registry supplies both the categorized comparison selector and backtest runner.
