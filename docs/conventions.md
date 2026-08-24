# Calculation conventions

Every choice here changes a number. Each is stated with the reasoning, so a future change is a
decision rather than a discovery.

## Day count

`prorationConvention`, per lease and per proposal. All three are supported; **where the lease is
silent, run the alternatives and report the range rather than picking one.**

| Value | Formula | Notes |
|---|---|---|
| `actual_month` | `rate × days ÷ days-in-that-month` | Default. Each calendar month contributes exactly one monthly rent regardless of length. |
| `actual_365` | `rate × 12 × days ÷ 365` | Annualise, then take the day fraction. The `× 12` is easy to drop, and dropping it produces a figure 12× too small that still looks like a plausible rent. |
| `thirty_360` | `rate × days360 ÷ 30` | US (NASD): `d1 = 31 → 30`, then `d2 = 31 and d1 ≥ 30 → 30`. Does **not** implement the end-of-February variant some houses use. |

`actual_month` is exact because `buildSegments` breaks every segment at month boundaries, so a
segment never spans two months and `days-in-month` is always the right denominator.

## End-of-month payment anchor

`paymentDayRule`. Only matters when the anchor falls on the 29th, 30th or 31st — every other day
exists in every month.

| Value | Jan 31 anchor produces | |
|---|---|---|
| `anchored` | 31 Jan, 28 Feb, **31 Mar**, 30 Apr | **Default.** Clamp only in the short month, then return to the nominal day. |
| `last_day` | month ends throughout | A different clause: an anchor on the 28th gives 28 Feb, **31 Mar**, 30 Apr rather than the 28th every month. |
| `clamped` | 31 Jan, 28 Feb, **28 Mar**, 28 Apr | **Legacy. Not a lease convention.** |

**Why `clamped` exists.** It was the original behaviour, and it was a bug rather than a choice.
`buildPeriods` iterated `s = addMonths(s, cad)`, so each clamp fed the next step, while
`buildRateEvents` anchored every step with `addMonths(anchor, cad*g)` and did not drift. Two
functions in the same file disagreed about what monthly recurrence means. Escalator steps landed
on dates the payment schedule had walked away from, and under a full-period basis a step could be
deferred by a whole month — `$150` on a 3% escalator over `$5,000`.

It is retained so a project saved before the setting existed can reproduce its old figures
exactly. Nothing else should use it.

**On load**, a file with no `paymentDayRule` and an anchor on day ≥ 29 gets a warning naming the
specific date that moved. Both schedules are built and compared to produce that message, so it
cannot drift away from what the engine actually does.

## Escalation

**Compounding.** `on_prior` applies each increase to the rent then in force — the usual reading.
`on_base` applies it to the rent at the start of that escalator, so a 3% escalator adds 3% of the
original rent every time. Where the clause is ambiguous, the Sensitivity tab prices both; over a
20-year term the gap is large.

**Cadence 0 is a one-time step.** Applied once on `firstAdjustment`, never repeated. With
`fixed_amount` this is how a permanent mid-term rent change — an equipment addition — is
expressed. There is no separate event type and none is needed. Three limits, all pinned by tests:

1. It expresses a **delta**, not an absolute reset.
2. A step dated exactly on the regime start is **dropped** (`buildRateEvents` requires
   `anchor > start`). Fold it into `baseRent` instead.
3. Same-date escalators apply in **row order** — `5000 × 1.10 + 400 = 5900`, but
   `5000 + 400` then `× 1.10 = 5940`.

**CPI** draws on `assumedCpiPct`, then floor, then cap — in that order. Cap binds last. Anything
depending on it is flagged as an assumption and re-run in the Sensitivity tab.

## Present value

Discounting is daily-exact: `(1 + r)^(-days/365)` from `pvReferenceDate`.

The shipped **6.5%** default treats rent as a contractual obligation and prices it near an
incremental borrowing rate — investment-grade corporate paper yields around 5.2–5.4%, tower and
carrier costs of capital around 6.3–6.8%. It is deliberately **not** the 8–14% lease-buyout firms
use: that is a buy-side required return, and applying it here understates long-dated rent and
flatters steep back-loaded escalators. Override it where treasury mandates a rate.

## Baseline

`baselineMode: continue` runs the current lease's terms past their stated expiry to the window
end, so a proposal that extends the term is not penalised merely for covering more time. The
continued portion is flagged as an assumption and broken out separately — it is not a contractual
obligation.

`expire` stops at expiry, which makes longer proposals look far more expensive on totals. Compare
effective monthly instead.

## The screening formula is deliberately separate

The original rent schedule's screening formula escalates with
`rent × (1 + r) ^ whole_years`. That is a **second escalation implementation, and it stays.**

It has no dates, no proration and no payment cycle, and it does not need them: it answers "is
this lease roughly in line with the market" across a portfolio. Routing it through the engine
would demand inputs a screening pass does not have — a commencement date, a payment cadence, a
day-count convention — to produce an answer no more useful for the question being asked.

The two agree only in the trivial case, and they should. They are not duplicated logic; they are
different questions. What would be a bug is a **third** implementation of the cash-flow
calculation. There is exactly one, in `src/lease-engine.js`.
