# tradstrats

A browser-based workspace for comparing registered trading strategies across historical crypto and foreign-exchange markets. Hyperliquid supplies perpetual-market candles; Frankfurter supplies daily FX reference rates. The app is for educational research only and does not place live orders.

## Run locally

```sh
bun install
bun run dev
```

Run the strategy tests with `bun run test`, Svelte and TypeScript checks with `bun run check`, or create a production build with `bun run build`.

## Data providers and local storage

- The Data Source page retrieves its catalog dynamically from Hyperliquid's `meta` endpoint and Frankfurter's `/v1/currencies` endpoint. Selected instruments are stored in browser `localStorage` and are shared with Backtesting and Analytics.
- Frankfurter tickers are USD-base pairs such as `USD/IDR`, `USD/AUD`, and `USD/SGD`: one US dollar expressed in the target currency. The list is generated dynamically from supported currencies and queried with a date range and `base`/`symbols` parameters.
- Frankfurter v1 is deprecated in favor of v2 but remains supported. It serves ECB daily reference rates (roughly 30 currencies), not intraday prices, OHLC, or volume. Rates can be absent on weekends and holidays. The app maps each observation to a flat daily candle for the existing strategy interface, marks volume unavailable, and clips any earlier observation returned around a requested range.
- Historical series are cached in IndexedDB by provider, instrument, timeframe, and provider-data version. Fresh cached coverage is reused; missing or older-than-24-hour ranges are requested and merged by timestamp. Successful ranges replace cached rows transactionally; failed requests leave those rows untouched. Use **Clear historical cache** on Data Source to invalidate stored history.
- No extra storage or chart dependencies are required; the cache uses the browser's native IndexedDB API.

## Backtest model

- Select a market, candle interval, and start/end month, then run the test. The end month includes data through the current time if it is the current month.
- Hyperliquid timeframes are 12 hours, 1 day, 3 days, 7 days, and 1 month. Weekly and monthly candles use Hyperliquid's native intervals. Frankfurter supports daily data only.
- Compare any number of registered strategies on the same market, timeframe, and date range.
- **Passive Investing:** Buy & Hold purchases at the first candle's open and holds through the test.
- **Systematic Investing:** Dollar Cost Averaging invests a fixed quote-currency amount per candle; Value Averaging adjusts holdings toward a linearly increasing portfolio-value target; Fixed-Quantity DCA buys a fixed quantity per candle calculated from the initial open and starting balance; Constant Proportion Rebalancing starts with equal asset/cash allocations and rebalances to a 50:50 ratio at each candle open.
- **Candle Momentum:** Compare separate 1- through 7-Candle Momentum strategies. Each enters after N consecutive bullish candles and exits after N consecutive bearish candles.
- **Technical Analysis:** SMA Cross (9/21), EMA Cross (9/21), MACD (12/26/9), RSI Mean Reversion (14-period RSI, 30/70 thresholds), Bollinger Band Reversion (20 periods, 2σ), Donchian Breakout (20 periods), Supertrend (ATR 10, multiplier 3), and Parabolic SAR (0.02 acceleration step, 0.2 maximum).
- Strategy orders based on candle data execute at the next candle's open after the signal candle closes. Systematic purchases are also placed at candle opens; orders are limited by the starting cash balance.
- The trade activity table lists each strategy order's timestamp, side, quantity, execution price, notional, and fee.
- Each strategy skips buy or sell orders below 10 quote-currency units notional.
- Hover over a result card to highlight its equity curve and show its buy/sell markers. Click a card to keep that strategy highlighted; click it again to clear the selection. Hover a chart marker for its execution details.
- The default timeframe is one day and the default date range covers approximately six months. Each strategy result includes ending units owned, cash left, and total fees paid. A 0.05% fee is charged on each buy or sell.
- Hyperliquid candles are requested from the `/info` endpoint using `meta` and `candleSnapshot`; snapshots are paginated because the API returns at most 500 records per time-range response.

## Analytics

- Select several Data Source instruments, one registry strategy (Buy & Hold by default), and a common monthly date range. The Analytics selection is independent of Data Source selections.
- The same strategy implementation and starting balance (10,000 quote-currency units), fee (0.05%), and minimum order notional (10 quote-currency units) are used for each market. Each equity curve is normalized to 100 at its starting point and plotted against observation dates.
- Price statistics describe observed closing prices. Risk metrics use strategy-equity returns, sample standard deviation, a 252-observation annualization convention, and a zero risk-free rate for Sharpe ratio. A metric is labeled unavailable when its data is insufficient or not provided.
- Frankfurter's daily rates are reference observations, not daily OHLC prices; its volume is unavailable.

This is an educational historical simulation, not financial advice. It does not model funding payments, slippage, liquidation, or intrabar order execution, and it does not place live orders.

## Adding a strategy

Implement a `StrategyDefinition` in `src/lib/strategies/`, assign it to a `StrategyCategory`, then add it to the `STRATEGIES` registry in `src/lib/strategies/index.ts`. The registry supplies both the categorized comparison selector and backtest runner.

To add a data provider, implement the shared `DataProvider` contract in `src/lib/data/providers/` and register it in that directory's index. Keep API parsing and capability limits inside the provider; the shared cache and pages consume the normalized instrument/candle types.
