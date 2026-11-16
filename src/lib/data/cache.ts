import type { Candle } from '../strategies/types'
import type {
  CachedRange,
  CachedSeriesSummary,
  DataProvider,
  HistoricalRange,
  MarketInstrument,
  ProviderId,
} from './types'
import { getDataProvider } from './providers'
import { nextCandleTime } from './providers/hyperliquid'

const DATABASE_NAME = 'tradstrats-historical-data'
const DATABASE_VERSION = 1
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000

type CoverageRecord = CachedRange & { key: string }
type CandleRecord = Candle & { key: string }

export interface HistoricalDataStore {
  getCoverage(key: string): Promise<CachedRange[]>
  getCandles(key: string): Promise<Candle[]>
  listSeriesSummaries(): Promise<CachedSeriesSummary[]>
  replaceRange(
    key: string,
    range: HistoricalRange,
    fetchedAt: number,
    candles: Candle[],
    coverageEndTime?: number,
  ): Promise<void>
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

  async listSeriesSummaries(): Promise<CachedSeriesSummary[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction(['candles', 'coverage'], 'readonly')
    const summaries = new Map<string, CachedSeriesSummary>()
    const candleCursor = transaction.objectStore('candles').openCursor()
    const coverageCursor = transaction.objectStore('coverage').openCursor()

    candleCursor.onsuccess = () => {
      const cursor = candleCursor.result
      if (!cursor) return
      const record = cursor.value as CandleRecord
      let summary = summaries.get(record.key)
      if (!summary) {
        summary = createSeriesSummary(record.key)
        summaries.set(record.key, summary)
      }
      summary.candleCount += 1
      summary.firstTimestamp = summary.firstTimestamp === null
        ? record.t
        : Math.min(summary.firstTimestamp, record.t)
      summary.lastTimestamp = summary.lastTimestamp === null
        ? record.t
        : Math.max(summary.lastTimestamp, record.t)
      cursor.continue()
    }

    coverageCursor.onsuccess = () => {
      const cursor = coverageCursor.result
      if (!cursor) return
      const record = cursor.value as CoverageRecord
      let summary = summaries.get(record.key)
      if (!summary) {
        summary = createSeriesSummary(record.key)
        summaries.set(record.key, summary)
      }
      summary.coverage.push({
        startTime: record.startTime,
        endTime: record.endTime,
        fetchedAt: record.fetchedAt,
      })
      cursor.continue()
    }

    await transactionResult(transaction)
    return [...summaries.values()]
      .map((summary) => ({
        ...summary,
        coverage: summary.coverage.sort((a, b) => a.startTime - b.startTime),
      }))
      .sort((a, b) =>
        a.providerId.localeCompare(b.providerId) ||
        a.instrumentId.localeCompare(b.instrumentId) ||
        a.interval.localeCompare(b.interval),
      )
  }

  async replaceRange(
    key: string,
    range: HistoricalRange,
    fetchedAt: number,
    candles: Candle[],
    coverageEndTime = range.endTime,
  ): Promise<void> {
    const database = await this.openDatabase()
    const transaction = database.transaction(['candles', 'coverage'], 'readwrite')
    const finished = transactionResult(transaction)
    const candleStore = transaction.objectStore('candles')
    const cursorRequest = candleStore.index('key').openCursor(key)
    const coverageStore = transaction.objectStore('coverage')
    const coverageCursorRequest = coverageStore.index('key').openCursor(key)
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
    }
    coverageCursorRequest.onsuccess = () => {
      const cursor = coverageCursorRequest.result
      if (cursor) {
        const record = cursor.value as CoverageRecord
        if (record.startTime <= range.endTime && record.endTime >= range.startTime) {
          cursor.delete()
          if (record.startTime < range.startTime) {
            coverageStore.put({
              key,
              startTime: record.startTime,
              endTime: range.startTime - 1,
              fetchedAt: record.fetchedAt,
            } satisfies CoverageRecord)
          }
          if (record.endTime > range.endTime) {
            coverageStore.put({
              key,
              startTime: range.endTime + 1,
              endTime: record.endTime,
              fetchedAt: record.fetchedAt,
            } satisfies CoverageRecord)
          }
        }
        cursor.continue()
        return
      }

      if (coverageEndTime >= range.startTime) {
        coverageStore.put({
          key,
          startTime: range.startTime,
          endTime: Math.min(range.endTime, coverageEndTime),
          fetchedAt,
        } satisfies CoverageRecord)
      }
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

function createSeriesSummary(key: string): CachedSeriesSummary {
  const [provider, instrumentId = key, interval = 'unknown'] = key.split('|')
  if (provider !== 'hyperliquid' && provider !== 'frankfurter') {
    throw new Error(`The historical cache contains an unsupported provider key: ${key}`)
  }
  return {
    key,
    providerId: provider,
    instrumentId,
    interval,
    candleCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    coverage: [],
  }
}

function intervalDuration(interval: string): number | null {
  const durations: Record<string, number> = {
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }
  return durations[interval] ?? null
}

function mutableTailStart(now: number, interval: string): number {
  if (interval === '1M') {
    const date = new Date(now)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 3, 1)
  }
  const duration = intervalDuration(interval)
  return duration ? now - duration * 4 : now
}

function closedCoverageEnd(now: number, interval: string): number {
  if (interval === '1M') {
    const date = new Date(now)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - 1
  }
  const duration = intervalDuration(interval)
  return duration ? now - duration : now
}

function isClosedHyperliquidCandle(candle: Candle, interval: string, now: number): boolean {
  return nextCandleTime(candle.t, interval) <= now
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
    const now = this.now()
    const isHyperliquid = instrument.providerId === 'hyperliquid'
    const tailStart = isHyperliquid ? mutableTailStart(now, interval) : range.endTime + 1
    const stableRange = isHyperliquid && !options.refresh
      ? { startTime: range.startTime, endTime: Math.min(range.endTime, tailStart - 1) }
      : range
    const missingRanges = stableRange.startTime <= stableRange.endTime
      ? options.refresh
        ? [stableRange]
        : planMissingRanges(stableRange, await this.store.getCoverage(key), now)
      : []
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
      const finalized = isHyperliquid
        ? inRange.filter((candle) => isClosedHyperliquidCandle(candle, interval, now))
        : inRange
      await this.store.replaceRange(
        key,
        missing,
        now,
        finalized,
        isHyperliquid && options.refresh
          ? Math.min(missing.endTime, closedCoverageEnd(now, interval))
          : missing.endTime,
      )
    }

    if (
      isHyperliquid &&
      !options.refresh &&
      range.endTime >= tailStart &&
      range.startTime <= now
    ) {
      const tailRange = {
        startTime: Math.max(range.startTime, tailStart),
        endTime: Math.min(range.endTime, now),
      }
      if (tailRange.startTime <= tailRange.endTime) {
        const loaded = await provider.fetchCandles(
          instrument,
          interval,
          tailRange.startTime,
          tailRange.endTime,
        )
        const finalized = loaded.filter((candle) =>
          candle.t >= tailRange.startTime &&
          candle.t <= tailRange.endTime &&
          isClosedHyperliquidCandle(candle, interval, now),
        )
        await this.store.replaceRange(
          key,
          tailRange,
          now,
          finalized,
          Math.min(tailRange.endTime, closedCoverageEnd(now, interval)),
        )
      }
    }

    return (await this.store.getCandles(key))
      .filter((candle) => candle.t >= range.startTime && candle.t <= range.endTime)
      .filter((candle) =>
        !isHyperliquid || isClosedHyperliquidCandle(candle, interval, now),
      )
      .sort((a, b) => a.t - b.t)
  }

  clear(): Promise<void> {
    return this.store.clear()
  }

  listCachedSeries(): Promise<CachedSeriesSummary[]> {
    return this.store.listSeriesSummaries()
  }

  getCachedCandles(key: string): Promise<Candle[]> {
    return this.store.getCandles(key)
  }
}

export const historicalDataCache = new HistoricalDataCache()
