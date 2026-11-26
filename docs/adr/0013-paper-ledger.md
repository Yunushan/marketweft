# 0013 · Simulate fills against an idempotent fixed-point ledger

Accepted for 0.13.0. Persist the event specification in the input and reconstruct the account from an observation prefix. Allow a repeated event ID only when its evidence is identical. Retain reasoned rejections beside accepted orders, partial fills and cancels.

Reserve the worst-case remaining purchase cost, including fees, and reserve available long shares for working sales. Keep cash and realized profit and loss in exact millionths. Require later eligible fill prices and implement a one-way account halt that releases every working reservation.
