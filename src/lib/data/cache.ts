import type { Candle } from '../strategies/types'
import type { CachedRange, DataProvider, HistoricalRange, MarketInstrument, ProviderId } from './types'
import { getDataProvider } from './providers'

const DATABASE_NAME = 'tradstrats-historical-data'
const DATABASE_VERSION = 1
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000

type CoverageRecord = CachedRange & { key: string }
type CandleRecord = Candle & { key: string }

export interface HistoricalDataStore {
  getCoverage(key: string): Promise<CachedRange[]>
  getCandles(key: string): Promise<Candle[]>
  replaceRange(key: string, range: HistoricalRange, fetchedAt: number, candles: Candle[]): Promise<void>
  clear(): Promise<void>
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to access the historical data cache.'))
  })
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to write the historical data cache.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('The historical data cache transaction was aborted.'))
  })
}

export class IndexedDbHistoricalDataStore implements HistoricalDataStore {
  private databasePromise: Promise<IDBDatabase> | null = null

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise
    const factory = globalThis.indexedDB
    if (!factory) return Promise.reject(new Error('This browser does not support IndexedDB.'))

    this.databasePromise = new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('candles')) {
          const store = database.createObjectStore('candles', { keyPath: ['key', 't'] })
          store.createIndex('key', 'key')
        }
        if (!database.objectStoreNames.contains('coverage')) {
          const store = database.createObjectStore('coverage', { keyPath: ['key', 'startTime', 'endTime'] })
          store.createIndex('key', 'key')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        this.databasePromise = null
        reject(request.error ?? new Error('Unable to open the historical data cache.'))
      }
      request.onblocked = () => {
        this.databasePromise = null
        reject(new Error('The historical data cache is blocked by another open tab.'))
      }
    })
    return this.databasePromise
  }

  async getCoverage(key: string): Promise<CachedRange[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction('coverage', 'readonly')
    const [result] = await Promise.all([
      requestResult(transaction.objectStore('coverage').index('key').getAll(key)),
      transactionResult(transaction),
    ])
    return result.map(({ startTime, endTime, fetchedAt }) => ({ startTime, endTime, fetchedAt }))
  }

  async getCandles(key: string): Promise<Candle[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction('candles', 'readonly')
    const [result] = await Promise.all([
      requestResult(transaction.objectStore('candles').index('key').getAll(key)),
      transactionResult(transaction),
    ])
    return result.map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v }))
  }

  async replaceRange(
    key: string,
    range: HistoricalRange,
    fetchedAt: number,
    candles: Candle[],
  ): Promise<void> {
    const database = await this.openDatabase()
    const transaction = database.transaction(['candles', 'coverage'], 'readwrite')
    const finished = transactionResult(transaction)
    const candleStore = transaction.objectStore('candles')
    const cursorRequest = candleStore.index('key').openCursor(key)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        const record = cursor.value as CandleRecord
        if (record.t >= range.startTime && record.t <= range.endTime) cursor.delete()
        cursor.continue()
        return
      }

      for (const candle of candles) {
        candleStore.put({ ...candle, key } satisfies CandleRecord)
      }
      transaction.objectStore('coverage').put({
        key,
        ...range,
        fetchedAt,
      } satisfies CoverageRecord)
    }
    await finished
  }

  async clear(): Promise<void> {
    const database = await this.openDatabase()
    const transaction = database.transaction(['candles', 'coverage'], 'readwrite')
    transaction.objectStore('candles').clear()
    transaction.objectStore('coverage').clear()
    await transactionResult(transaction)
  }
}

export function makeCacheKey(instrument: MarketInstrument, interval: string): string {
  const providerVersion = instrument.providerId === 'frankfurter' ? 'v1-ecb' : 'perpetuals-v1'
  return [instrument.providerId, instrument.id, interval, providerVersion].join('|')
}

export function planMissingRanges(
  requested: HistoricalRange,
  coverage: CachedRange[],
  now: number,
  maxAge = CACHE_MAX_AGE,
): HistoricalRange[] {
  const covered = coverage
    .filter((range) => now >= range.fetchedAt && now - range.fetchedAt < maxAge)
    .map((range) => ({
      startTime: Math.max(requested.startTime, range.startTime),
      endTime: Math.min(requested.endTime, range.endTime),
    }))
    .filter((range) => range.startTime <= range.endTime)
    .sort((a, b) => a.startTime - b.startTime)

  const missing: HistoricalRange[] = []
  let nextStart = requested.startTime
  for (const range of covered) {
    if (range.startTime > nextStart) {
      missing.push({ startTime: nextStart, endTime: range.startTime - 1 })
    }
    nextStart = Math.max(nextStart, range.endTime + 1)
    if (nextStart > requested.endTime) break
  }
  if (nextStart <= requested.endTime) {
    missing.push({ startTime: nextStart, endTime: requested.endTime })
  }
  return missing
}

export class HistoricalDataCache {
  constructor(
    private readonly store: HistoricalDataStore = new IndexedDbHistoricalDataStore(),
    private readonly now: () => number = Date.now,
    private readonly resolveProvider: (id: ProviderId) => DataProvider = getDataProvider,
  ) {}

  async getCandles(
    instrument: MarketInstrument,
    interval: string,
    range: HistoricalRange,
    options: { refresh?: boolean } = {},
  ): Promise<Candle[]> {
    if (range.startTime > range.endTime) throw new Error('Start date must be before or equal to end date.')
    const provider = this.resolveProvider(instrument.providerId)
    if (!provider.timeframes.some((timeframe) => timeframe.value === interval)) {
      throw new Error(`${provider.name} does not support the selected timeframe.`)
    }

    const key = makeCacheKey(instrument, interval)
    const missingRanges = options.refresh
      ? [range]
      : planMissingRanges(range, await this.store.getCoverage(key), this.now())
    for (const missing of missingRanges) {
      const loaded = await provider.fetchCandles(
        instrument,
        interval,
        missing.startTime,
        missing.endTime,
      )
      const inRange = loaded.filter(
        (candle) => candle.t >= missing.startTime && candle.t <= missing.endTime,
      )
      await this.store.replaceRange(key, missing, this.now(), inRange)
    }

    return (await this.store.getCandles(key))
      .filter((candle) => candle.t >= range.startTime && candle.t <= range.endTime)
      .sort((a, b) => a.t - b.t)
  }

  clear(): Promise<void> {
    return this.store.clear()
  }
}

export const historicalDataCache = new HistoricalDataCache()
