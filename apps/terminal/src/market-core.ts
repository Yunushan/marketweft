/** Chart-facing numbers represent six-place fixed-point prices and volume. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketCore {
  instrument(venue: string, symbol: string): string;
  parseCsv(csv: string): Bar[];
  indicator(kind: 'sma' | 'ema', period: number, bars: readonly Bar[]): (number | null)[];
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

  return {
    instrument(venue, symbol) {
      textInput(venue + '\n' + symbol);
      return decoder.decode(output(api.mw_instrument()));
    },
    parseCsv(csv) {
      textInput(csv);
      const out = output(api.mw_parse());
      const fixed = (offset: number) => Number(out.getBigInt64(offset, true)) / SCALE;
      const bars: Bar[] = [];
      for (let i = 0; i < out.byteLength; i += 48) {
        bars.push({ time: Number(out.getBigInt64(i, true)), open: fixed(i + 8), high: fixed(i + 16),
          low: fixed(i + 24), close: fixed(i + 32), volume: fixed(i + 40) });
      }
      return bars;
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
