import type { BacktestResult, TradeOrder } from './types'

export function createBacktestResult(
  equity: number[],
  trades: number,
  startingBalance: number,
  position: { unitsOwned: number; cashBalance: number; feesPaid: number; orders: TradeOrder[] },
): BacktestResult {
  const finalBalance = equity[equity.length - 1]

  let peak = equity[0]
  let maxDrawdown = 0
  for (const value of equity) {
    peak = Math.max(peak, value)
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak)
  }

  return {
    equity,
    totalReturn: (finalBalance / startingBalance - 1) * 100,
    maxDrawdown: maxDrawdown * 100,
    trades,
    finalBalance,
    ...position,
  }
}
