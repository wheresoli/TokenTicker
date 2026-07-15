# LLM API Token Price Index

A small, portable, shareable price-per-million-token comparison across the major
LLM API providers (OpenAI · Anthropic · Google). One JSON file is the source of
truth; a zero-dependency script renders it into a self-contained web page.

> **The honest part:** there is no canonical, cross-provider *live* pricing API.
> Prices here are **hand-maintained** from each provider's own pricing page (linked
> in the data and footer, each stamped with the date it was verified). "Live" here
> means *trivial to update and republish*, not *auto-fetched*. Re-verify against the
> source links before relying on a number.

## Files

| File | Role |
|---|---|
| `pricing.json` | **Source of truth.** Edit this. Also directly consumable by other tools. |
| `template.html` | The page UI (styles + markup + logic). Edit only to change look/behavior. |
| `build.mjs` | Renders `pricing.json` → HTML. No dependencies. |
| `index.html` | **Generated.** Standalone page — open it, or host it anywhere. |
| `llm-token-price-index.html` | **Generated.** Body-only fragment for publishing as a Claude Artifact. |

`index.html` and the fragment are build outputs — don't edit them by hand; they get
overwritten on the next build.

## Update the prices

1. Open a provider's pricing page (links are in `pricing.json` under each `source`).
2. Edit the numbers in `pricing.json` and bump that provider's `verified` date
   (and `meta.updated`).
3. Rebuild:

   ```sh
   node build.mjs
   ```

That's the whole loop: **edit JSON → `node build.mjs` → publish.** Adding a model is
just another object in a provider's `models` array; adding a provider is another
entry in `providers` (give it an `accent` hex for its dot).

## Data shape

```jsonc
{
  "meta": { "title", "unit", "tier", "updated", "disclaimer" },
  "providers": [{
    "name", "accent", "source", "verified",
    "models": [{
      "name", "id", "tier",          // tier: frontier | flagship | workhorse | small
      "input", "output",             // USD per 1,000,000 tokens (required)
      "cachedInput",                 // optional
      "context",                     // e.g. "1M", "200K"
      "note"                         // optional (intro pricing, tiered rates, …)
    }]
  }]
}
```

The page shows input/output $/1M, a **cost-per-call** estimate you can tune by token
count, context window, and per-model notes, sortable by any column.

## Publish it

`index.html` is fully self-contained (no external requests, no build server), so any
of these work:

- **Just send the file** — it opens standalone in any browser.
- **GitHub Pages** — push the repo, enable Pages; `index.html` is the site.
- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop or connect the repo; no build
  command needed (or set it to `node build.mjs`).
- **Claude Artifact** — publish the `llm-token-price-index.html` fragment for an instant
  shareable link (private until you share it).

## Regenerating

Everything downstream of `pricing.json` is reproducible with `node build.mjs`.
If you only want the data, ignore the HTML entirely and consume `pricing.json`.
