import { frankfurterProvider } from './frankfurter'
import { hyperliquidProvider } from './hyperliquid'
import type { DataProvider, ProviderId } from '../types'

export const DATA_PROVIDERS: DataProvider[] = [
  hyperliquidProvider,
  frankfurterProvider,
]

export function getDataProvider(id: ProviderId): DataProvider {
  const provider = DATA_PROVIDERS.find((item) => item.id === id)
  if (!provider) throw new Error(`Unknown data provider: ${id}`)
  return provider
}
