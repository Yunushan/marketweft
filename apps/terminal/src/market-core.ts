/** Chart-facing numbers represent six-place fixed-point prices and volume. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const replayKinds = ['open', 'bar', 'missing', 'close'] as const;
export interface ReplayEvent {
  kind: typeof replayKinds[number];
  eventTime: number;
  observedAt: number;
  barIndex: number | null;
  sessionIndex: number;
  utcOffsetMinutes: number;
  earlyClose: boolean;
}

export interface Split {
  announcedAt: number;
  effectiveAt: number;
  observedAt: number;
  newShares: number;
  oldShares: number;
}

const dividendKinds = ['report', 'ex', 'pay'] as const;
export interface DividendMovement {
  currency: string;
  receivableDelta: bigint;
  cashDelta: bigint;
  receivable: bigint;
  cash: bigint;
}
export interface DividendEvent {
  at: number;
  kind: typeof dividendKinds[number];
  id: string;
  announcedAt: number;
  exAt: number;
  payAt: number;
  observedAt: number;
  currency: string;
  amountPerShare: bigint;
  movements: DividendMovement[];
}

const universeStatuses = ['member', 'removed', 'delisted'] as const;
export interface UniverseListing {
  listingId: string;
  instrument: string;
  status: typeof universeStatuses[number];
  changeId: string;
  effectiveAt: number;
  observedAt: number;
}

export interface MarketCore {
  instrument(venue: string, symbol: string): string;
  parseCsv(csv: string): Bar[];
  indicator(kind: 'sma' | 'ema', period: number, bars: readonly Bar[]): (number | null)[];
  replay(calendar: string, intervalSeconds: number, bars: readonly Bar[]): ReplayEvent[];
  splitBook(instrument: string, csv: string): Split[];
  adjustSplits(bars: readonly Bar[], splits: readonly Split[], asOf: number): Bar[];
  dividendLedger(instrument: string, csv: string, entitledShares: number): DividendEvent[];
  universeIndex(csv: string): { name: string; checkpoints: number[] };
  universeAsOf(csv: string, effectiveAt: string, knownAt: string): UniverseListing[];
}

interface MarketExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  mw_version(): number;
  mw_input(bytes: number): number;
  mw_output(): number;
  mw_output_len(): number;
  mw_instrument(): number;
  mw_parse(): number;
  mw_indicator(kind: number, period: number): number;
  mw_replay(calendarBytes: number, intervalSeconds: number): number;
  mw_split_book(): number;
  mw_adjust_splits(records: number): number;
  mw_dividend_ledger(shares: number): number;
  mw_universe_index(): number;
  mw_universe_as_of(): number;
}

const SCALE = 1_000_000;
const MISSING = -(1n << 63n);
const LIMIT = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function instantiateMarketCore(bytes: ArrayBuffer): Promise<MarketCore> {
  const instance = await WebAssembly.instantiate(bytes);
  const api = instance.instance.exports as MarketExports;
  if (api.mw_version() !== 1) throw new Error('Unsupported MarketWeft calculation engine.');

  function input(len: number): DataView {
    if (len > LIMIT) throw new Error('Input exceeds 8 MiB.');
    const ptr = api.mw_input(len);
    if (!ptr) throw new Error('The calculation engine could not allocate input.');
    return new DataView(api.memory.buffer, ptr, len);
  }

  function textInput(text: string) {
    if (text.length > LIMIT) throw new Error('Input exceeds 8 MiB.');
    const data = encoder.encode(text);
    const dest = input(data.byteLength);
    new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(data);
  }

  function output(status: number): DataView {
    const view = new DataView(api.memory.buffer, api.mw_output(), api.mw_output_len());
    if (status !== 0) throw new Error(decoder.decode(view));
    return view;
  }

  function decodeBars(out: DataView): Bar[] {
    const fixed = (offset: number) => Number(out.getBigInt64(offset, true)) / SCALE;
    const bars: Bar[] = [];
    for (let i = 0; i < out.byteLength; i += 48) {
      bars.push({ time: Number(out.getBigInt64(i, true)), open: fixed(i + 8), high: fixed(i + 16),
        low: fixed(i + 24), close: fixed(i + 32), volume: fixed(i + 40) });
    }
    return bars;
  }

  return {
    instrument(venue, symbol) {
      textInput(venue + '\n' + symbol);
      return decoder.decode(output(api.mw_instrument()));
    },
    parseCsv(csv) {
      textInput(csv);
      return decodeBars(output(api.mw_parse()));
    },
    indicator(kind, period, bars) {
      if (kind !== 'sma' && kind !== 'ema') throw new Error('Unknown indicator.');
      if (!Number.isInteger(period) || period < 1 || period > 100_000 || bars.length > 100_000) {
        throw new Error('Series and indicator period must fit within 100,000 bars.');
      }
      const dest = input(bars.length * 8);
      bars.forEach(({ close }, i) => {
        const ticks = Math.round(close * SCALE);
        if (!Number.isSafeInteger(ticks) || Math.abs(close) > 2_000_000_000 ||
          close !== ticks / SCALE) {
          throw new Error('Close must be a finite six-place fixed-point price.');
        }
        dest.setBigInt64(i * 8, BigInt(ticks), true);
      });
      const out = output(api.mw_indicator(kind === 'sma' ? 0 : 1, period));
      return Array.from({ length: bars.length }, (_, i) => {
        const v = out.getBigInt64(i * 8, true);
        return v === MISSING ? null : Number(v) / SCALE;
      });
    },
    replay(calendar, intervalSeconds, bars) {
      if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 86_400) {
        throw new Error('Replay interval must be 1–86,400 seconds.');
      }
      if (bars.length > 100_000) throw new Error('Replay supports up to 100,000 bars.');
      const calendarLimit = 1024 * 1024;
      if (calendar.length > calendarLimit) throw new Error('Session calendar exceeds 1 MiB.');
      const encoded = encoder.encode(calendar);
      if (encoded.length > calendarLimit) throw new Error('Session calendar exceeds 1 MiB.');
      const dest = input(encoded.length + bars.length * 8);
      new Uint8Array(dest.buffer, dest.byteOffset, encoded.length).set(encoded);
      bars.forEach(({ time }, i) => {
        if (!Number.isSafeInteger(time)) throw new Error('Bar time must be integer UTC seconds.');
        dest.setBigInt64(encoded.length + i * 8, BigInt(time), true);
      });
      const out = output(api.mw_replay(encoded.length, intervalSeconds));
      const events: ReplayEvent[] = [];
      for (let i = 0; i < out.byteLength; i += 32) {
        const index = out.getInt32(i + 16, true);
        const flags = out.getUint32(i + 28, true);
        events.push({
          kind: replayKinds[flags & 255],
          eventTime: Number(out.getBigInt64(i, true)),
          observedAt: Number(out.getBigInt64(i + 8, true)),
          barIndex: index < 0 ? null : index,
          sessionIndex: out.getUint32(i + 20, true),
          utcOffsetMinutes: out.getInt32(i + 24, true),
          earlyClose: Boolean(flags & 256),
        });
      }
      return events;
    },
    universeIndex(csv) {
      textInput(csv);
      const [name, ...checkpoints] = decoder.decode(output(api.mw_universe_index())).split('\n');
      return { name, checkpoints: checkpoints.map(Number) };
    },
    universeAsOf(csv, effectiveAt, knownAt) {
      if ([effectiveAt, knownAt].some(value => value.length !== 20 || /[\n\r]/.test(value))) {
        throw new Error('Both cutoffs require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.');
      }
      textInput(effectiveAt + '\n' + knownAt + '\n' + csv);
      const text = decoder.decode(output(api.mw_universe_as_of())).trimEnd();
      if (!text) return [];
      return text.split('\n').map(line => {
        const [listingId, instrument, status, changeId, effectiveAt, observedAt] = line.split('\t');
        return { listingId, instrument, status: universeStatuses[Number(status)], changeId,
          effectiveAt: Number(effectiveAt), observedAt: Number(observedAt) };
      });
    },
    splitBook(instrument, csv) {
      textInput(instrument + '\n' + csv);
      const out = output(api.mw_split_book());
      const records: Split[] = [];
      for (let i = 0; i < out.byteLength; i += 32) {
        records.push({
          announcedAt: Number(out.getBigInt64(i, true)),
          effectiveAt: Number(out.getBigInt64(i + 8, true)),
          observedAt: Number(out.getBigInt64(i + 16, true)),
          newShares: out.getUint32(i + 24, true),
          oldShares: out.getUint32(i + 28, true),
        });
      }
      return records;
    },
    dividendLedger(instrument, csv, entitledShares) {
      if (!Number.isInteger(entitledShares) || entitledShares < 0 || entitledShares > 1_000_000) {
        throw new Error('Supply 0–1,000,000 whole entitled shares.');
      }
      textInput(instrument + '\n' + csv);
      const data = decoder.decode(output(api.mw_dividend_ledger(entitledShares)));
      return data.trimEnd().split('\n').map(line => {
        const [at, kind, id, announcedAt, exAt, payAt, observedAt, currency, perShare, ...changes] = line.split('\t');
        return {
          at: Number(at), kind: dividendKinds[Number(kind)], id,
          announcedAt: Number(announcedAt), exAt: Number(exAt), payAt: Number(payAt),
          observedAt: Number(observedAt), currency, amountPerShare: BigInt(perShare),
          movements: changes.map(change => {
            const [currency, receivableDelta, cashDelta, receivable, cash] = change.split(',');
            return { currency, receivableDelta: BigInt(receivableDelta), cashDelta: BigInt(cashDelta),
              receivable: BigInt(receivable), cash: BigInt(cash) };
          }),
        };
      });
    },
    adjustSplits(bars, splits, asOf) {
      if (bars.length > 100_000 || splits.length > 1_000) throw new Error('Split-adjustment input is too large.');
      const dest = input(8 + splits.length * 32 + bars.length * 48);
      const timestamp = (offset: number, value: number) => {
        if (!Number.isSafeInteger(value)) throw new Error('Split adjustment requires integer UTC seconds.');
        dest.setBigInt64(offset, BigInt(value), true);
      };
      timestamp(0, asOf);
      let offset = 8;
      for (const row of splits) {
        timestamp(offset, row.announcedAt);
        timestamp(offset + 8, row.effectiveAt);
        timestamp(offset + 16, row.observedAt);
        for (const [index, value] of [row.newShares, row.oldShares].entries()) {
          if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
            throw new Error('Share counts must be whole numbers between 1 and 1,000,000.');
          }
          dest.setUint32(offset + 24 + index * 4, value, true);
        }
        offset += 32;
      }
      for (const bar of bars) {
        timestamp(offset, bar.time);
        const fields = [bar.open, bar.high, bar.low, bar.close, bar.volume];
        for (const [index, value] of fields.entries()) {
          const ticks = Math.round(value * SCALE);
          if (!Number.isSafeInteger(ticks) || Math.abs(value) > 2_000_000_000 ||
              value !== ticks / SCALE || (index === 4 && value < 0)) {
            throw new Error('Split adjustment requires valid six-place OHLCV values.');
          }
          dest.setBigInt64(offset + 8 + index * 8, BigInt(ticks), true);
        }
        offset += 48;
      }
      return decodeBars(output(api.mw_adjust_splits(splits.length)));
    },
  };
}

let pending: Promise<MarketCore> | undefined;
export function loadMarketCore(): Promise<MarketCore> {
  pending ??= fetch(new URL('marketweft_core.wasm', document.baseURI))
    .then(async response => {
      if (!response.ok) throw new Error('Could not load the MarketWeft calculation engine.');
      return instantiateMarketCore(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
