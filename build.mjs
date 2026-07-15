// Build the price index into publishable HTML.
// Single source of truth: pricing.json  ->  index.html (standalone) + artifact.html (fragment)
// Zero dependencies. Run:  node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(dir, f), "utf8");

const data = JSON.parse(read("pricing.json"));
const history = JSON.parse(read("history.json"));
const inner = read("template.html")
  .replace("__PRICING_JSON__", JSON.stringify(data))
  .replace("__HISTORY_JSON__", JSON.stringify(history));

const title = data.meta.title;
const desc = `${data.meta.unit} across OpenAI, Anthropic & Google. Updated ${data.meta.updated}.`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<style>html,body{margin:0}body{background:#fbfbf9}@media(prefers-color-scheme:dark){body{background:#16161a}}:root[data-theme="dark"] body{background:#16161a}:root[data-theme="light"] body{background:#fbfbf9}</style>
</head>
<body>
${inner}
</body>
</html>
`;

writeFileSync(join(dir, "index.html"), html);
// Fragment for publishing as a hosted Artifact (no <html>/<head>/<body> wrapper;
// leading <title> names the tab/gallery entry — it never renders in-body).
writeFileSync(join(dir, "llm-token-price-index.html"), `<title>${title}</title>\n${inner}`);

const n = data.providers.reduce((s, p) => s + p.models.length, 0);
console.log(`Built index.html + llm-token-price-index.html — ${n} models across ${data.providers.length} providers (updated ${data.meta.updated}).`);
