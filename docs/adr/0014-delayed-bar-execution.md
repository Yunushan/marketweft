# 0014 · Backtest against observed closes and the paper ledger

Accepted for 0.14.0. A completed bar can generate an SMA signal and an order. An eligible later completed bar supplies the execution price and available volume. This matches the actual observation boundary of OHLCV data. Preserve a missing interval in stepped replay without inventing a price or volume.

Use a bounded participation fraction and adverse basis-point slippage. Record accepted and rejected attempts through the same fixed-point account used for paper fills. An observation prefix produces the same signals, receipts and marks inside a longer run.
