// update.mjs — refresh prices from the OpenRouter feed, validate, append a
// dated history snapshot. Run by the GitHub Action (and manually: `node update.mjs`).
// Guardrails: bad/implausible numbers and large jumps are NOT committed — the
// previous curated value is kept and the change is flagged in the run report.
// Heartbeat: every run stamps heartbeat.json. A feed outage makes no price changes,
// so without that stamp it would produce an empty diff and read exactly like a quiet
// day — the site would go stale in silence. See the failure branch in main().
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const P = (f) => join(dir, f);

const FEED = "https://openrouter.ai/api/v1/models";
const JUMP = 0.4; // flag relative changes larger than ±40% for human review
const MAX_IN = 1000; // $/1M sanity ceilings
const MAX_OUT = 2000;
const TRIES = 3; // retry within the run so one blip doesn't cry wolf
const BACKOFF = 5000; // ms, multiplied by attempt number

const today = process.env.SNAPSHOT_DATE || new Date().toISOString().slice(0, 10);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const per1M = (v) => {
  const n = Number(v);
  return v == null || Number.isNaN(n) ? null : Math.round(n * 1e6 * 1e4) / 1e4;
};

const BEAT0 = { lastSuccess: null, lastRun: null, consecutiveFailures: 0, lastError: null };
const readBeat = () => {
  try { return { ...BEAT0, ...JSON.parse(readFileSync(P("heartbeat.json"), "utf8")) }; }
  catch { return { ...BEAT0 }; } // missing or corrupt — a fresh stamp beats crashing
};
const writeBeat = (b) => writeFileSync(P("heartbeat.json"), JSON.stringify(b, null, 2) + "\n");
const daysSince = (d) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 864e5) : null);

const emit = (report, stream = console.log) => {
  stream(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
};

async function fetchFeed() {
  let last;
  for (let i = 1; i <= TRIES; i++) {
    try {
      const res = await fetch(FEED, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      if (i < TRIES) await new Promise((r) => setTimeout(r, BACKOFF * i));
    }
  }
  throw last;
}

async function main() {
  const pricing = JSON.parse(readFileSync(P("pricing.json"), "utf8"));
  const beat = readBeat();
  const priorFailures = beat.consecutiveFailures;

  let feed;
  try {
    feed = await fetchFeed();
  } catch (e) {
    // Keep last-known-good; do not commit a broken table. But stamp the miss: that
    // turns an empty diff into a committed record and lets the workflow go red.
    writeBeat({
      ...beat,
      lastRun: today,
      consecutiveFailures: priorFailures + 1,
      lastError: `${today}: ${e.message}`,
    });
    const stale = daysSince(beat.lastSuccess);
    emit(
      [
        `# TokenTicker price refresh — ${today}`,
        `**Feed unreachable** after ${TRIES} attempts — \`${e.message}\`. No prices changed.`,
        `- consecutive failed runs: ${priorFailures + 1}`,
        `- last good refresh: ${beat.lastSuccess ?? "never"}` +
          (stale == null ? "" : ` (${stale} day${stale === 1 ? "" : "s"} ago)`),
        `- the published site keeps serving that data until this clears`,
      ].join("\n"),
      console.error
    );
    process.exitCode = 1; // workflow commits the stamp first, then fails on this
    return;
  }

  const models = feed.data || feed.models || [];
  const index = new Map();
  for (const m of models) if (m && m.pricing) index.set(norm(m.id), m);

  const applied = [], flagged = [], missing = [];

  for (const prov of pricing.providers) {
    let sawFeed = false;
    for (const m of prov.models) {
      const src = index.get(norm(prov.name) + norm(m.id)) || index.get(norm(m.id));
      if (!src) { missing.push(`${prov.name}:${m.id}`); continue; }
      sawFeed = true;
      const inp = per1M(src.pricing.prompt);
      const out = per1M(src.pricing.completion);
      const cin = per1M(src.pricing.input_cache_read);

      if (inp == null || out == null || inp <= 0 || out <= 0 || inp > MAX_IN || out > MAX_OUT) {
        flagged.push(`${prov.name}:${m.id} — out-of-bounds (in=${inp}, out=${out})`);
        continue;
      }
      const dIn = Math.abs(inp - m.input) / (m.input || inp);
      const dOut = Math.abs(out - m.output) / (m.output || out);
      if (dIn > JUMP || dOut > JUMP) {
        flagged.push(`${prov.name}:${m.id} — large jump in ${m.input}→${inp}, out ${m.output}→${out} (kept old)`);
        continue;
      }
      if (m.input !== inp || m.output !== out) {
        applied.push(`${prov.name}:${m.id} — in ${m.input}→${inp}, out ${m.output}→${out}`);
      }
      m.input = inp;
      m.output = out;
      if (cin != null && cin > 0 && cin <= inp) m.cachedInput = cin;
    }
    if (sawFeed) prov.verified = today; // we checked this provider against the feed today
  }

  pricing.meta.updated = today;
  writeFileSync(P("pricing.json"), JSON.stringify(pricing, null, 2) + "\n");

  // Append (or replace) today's snapshot in the history time series.
  const hist = JSON.parse(readFileSync(P("history.json"), "utf8"));
  const prices = {};
  for (const prov of pricing.providers)
    for (const m of prov.models) prices[`${prov.name}:${m.id}`] = { in: m.input, out: m.output };
  const snap = { date: today, prices };
  const at = hist.snapshots.findIndex((s) => s.date === today);
  if (at >= 0) hist.snapshots[at] = snap;
  else hist.snapshots.push(snap);
  hist.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));
  writeFileSync(P("history.json"), JSON.stringify(hist, null, 2) + "\n");

  writeBeat({ lastSuccess: today, lastRun: today, consecutiveFailures: 0, lastError: null });

  const report = [
    `# TokenTicker price refresh — ${today}`,
    `applied: ${applied.length} · flagged (kept old): ${flagged.length} · missing from feed: ${missing.length}`,
    priorFailures ? `\n_Feed recovered after ${priorFailures} failed run${priorFailures === 1 ? "" : "s"}._` : "",
    applied.length ? `\n**Applied**\n- ${applied.join("\n- ")}` : "",
    flagged.length ? `\n**Flagged for review (NOT applied)**\n- ${flagged.join("\n- ")}` : "",
    missing.length ? `\n**Missing from feed (kept curated value)**\n- ${missing.join("\n- ")}` : "",
  ].filter(Boolean).join("\n");
  emit(report);
}

main();
