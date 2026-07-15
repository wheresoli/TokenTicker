# TokenTicker

A small, portable, shareable price-per-million-token index for the major LLM API
providers (OpenAI · Anthropic · Google), with a **table view**, a **cost-per-call
estimator**, and a **trends view** that graphs prices over time.

Live: **https://wheresoli.github.io/TokenTicker/**

## How freshness works

There is no canonical cross-provider *live* pricing API, so prices are pulled from
the **OpenRouter models feed** (`/api/v1/models`), which reports the actual
per-token price each provider bills. Two independent mechanisms keep the page fresh:

1. **Scheduled auto-update (GitHub Action, daily).** `.github/workflows/update-prices.yml`
   runs `update.mjs` → fetches the feed → **validates** (sanity bounds + rejects any
   change larger than ±40%, keeping the previous value and flagging it in the run
   summary) → rewrites `pricing.json` → appends a dated snapshot to `history.json` →
   rebuilds the HTML → commits. Nothing implausible ships silently. Works everywhere,
   including the static Artifact snapshot.
2. **Runtime fetch (Pages/standalone only).** On load the page fetches the same feed
   and refreshes the current numbers, showing a **live ·** status; on any failure it
   falls back to the committed `pricing.json` and shows **snapshot ·**. The Artifact
   build can't do this (its CSP blocks external requests) — it always shows the
   committed snapshot.

Guardrails are the same in both: bounds-check, ignore absurd jumps, keep last-known-good.

## Trends / history

Every update appends a `{date, prices}` snapshot to `history.json`. The **Trends**
view graphs any metric (input, output, or cost-per-call) over time, per model, with
log/linear scale and model toggles. The chart is a **dependency-free inline SVG** —
no chart library — so it works offline, on Pages, and inside the Artifact. History
starts with a single real snapshot and fills in one point per day; **past points are
never fabricated.**

## Files

| File | Role |
|---|---|
| `pricing.json` | Current prices — machine-readable index + curation (names, ids, tiers, notes). Rewritten by `update.mjs`. |
| `history.json` | Append-only time series of dated snapshots (drives the trends chart). |
| `update.mjs` | Fetch feed → validate → write `pricing.json` + append `history.json`. Run by the Action. |
| `template.html` | The UI (styles + markup + logic). The only file you hand-edit for look/behavior. |
| `build.mjs` | Renders `pricing.json` + `history.json` into HTML. Zero dependencies. |
| `index.html` | **Generated** standalone page (what Pages serves). |
| `llm-token-price-index.html` | **Generated** body-only fragment for publishing as a Claude Artifact. |
| `.github/workflows/update-prices.yml` | Daily cron + manual dispatch. |

`index.html` and the fragment are build outputs — don't hand-edit; they're overwritten.

## Update / run locally

```sh
node update.mjs   # refresh prices from the feed + append today's history snapshot
node build.mjs    # regenerate index.html + the Artifact fragment
```

Curation is preserved across refreshes: `update.mjs` only touches numeric fields and
`verified` dates — it never overwrites model names, tiers, or notes. A model the feed
doesn't match (e.g. `gemini-3.1-pro`) keeps its curated value and is listed under
"missing from feed" in the run report. Provider line/dot colors are validated
colorblind-safe on both light and dark surfaces (`dataviz` skill's `validate_palette.js`).

## Publish

`index.html` is fully self-contained (no external requests required), so it works as:
a plain file you send, **GitHub Pages** (current), Netlify/Vercel/Cloudflare Pages, or a
**Claude Artifact** (publish the `llm-token-price-index.html` fragment).

## Honest caveats

- The OpenRouter feed is a **maintained aggregator**, not each provider's canonical
  API — spot-check against the source links in the footer for anything mission-critical.
- Numbers reflect **actual current billable price**, so temporary promos show through
  (e.g. Claude Sonnet 5's intro $2/$10); the per-model note explains when they end.
- The trends chart is **sparse until history accrues** — one point today, one more per day.
