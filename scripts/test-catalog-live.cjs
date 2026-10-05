const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const flush = () => new Promise(resolve => setImmediate(resolve));

async function run() {
  let tick, enabled = false, refreshes = 0, fetches = 0, version = "1", blocked = false;
  const events = {};
  const document = { hidden: false, addEventListener: (name, cb) => { events[name] = cb; }, removeEventListener: name => { delete events[name]; } };
  const window = { addEventListener: (name, cb) => { events[name] = cb; }, removeEventListener: name => { delete events[name]; } };
  const context = vm.createContext({ window, document, AbortController, Date,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: cb => { tick = cb; return 1; }, clearInterval: () => { tick = null; },
    fetch: async (_, options) => { assert.equal(options.cache, "no-store"); fetches++; return { ok: true, json: async () => ({ change_token: version }) }; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "catalog-live.js"), "utf8"), context);
  const stop = window.watchCatalogChanges({ url: "https://api.example/catalog/version", enabled: () => enabled, refresh: async () => { if (blocked) return false; refreshes++; } });
  await flush(); assert.equal(fetches, 0, "signed-out pages must not poll");
  enabled = true; tick(); await flush(); assert.equal(refreshes, 1);
  tick(); await flush(); assert.equal(refreshes, 1, "unchanged revision must not reload tables");
  version = "2"; tick(); await flush(); assert.equal(refreshes, 2, "provider change must refresh admin without an activity event");
  document.hidden = true; const previous = fetches; tick(); await flush(); assert.equal(fetches, previous);
  document.hidden = false; events.focus(); await flush(); assert.equal(refreshes, 3, "foreground must revalidate immediately");
  version = "3"; blocked = true; tick(); await flush(); assert.equal(refreshes, 3);
  blocked = false; tick(); await flush(); assert.equal(refreshes, 4, "a busy moderation dialog must defer, not consume, the change");
  stop(); assert.equal(tick, null);

  const source = fs.readFileSync(path.join(__dirname, "..", "provider-admin.js"), "utf8");
  const start = source.indexOf("  async function loadMerchantProducts(");
  const end = source.indexOf("\n  function renderProviders(", start);
  assert.ok(start > 0 && end > start);
  const pending = [];
  const state = { merchantProducts: [], merchantProductCursor: "" };
  const loader = vm.createContext({ state, productLoadRevision: 0, setText: () => {}, renderMerchantProducts: () => {}, queryParams: () => "", request: () => new Promise(resolve => pending.push(resolve)) });
  vm.runInContext(source.slice(start, end), loader);
  const old = loader.loadMerchantProducts({ reset: true });
  const recent = loader.loadMerchantProducts({ reset: true });
  pending[1]({ items: [{ id: "watch", local_selling_price: 100 }], page: {} }); await recent;
  pending[0]({ items: [{ id: "watch", local_selling_price: 20 }], page: {} }); await old;
  assert.equal(state.merchantProducts[0].local_selling_price, 100, "late old admin responses must not overwrite newer prices");
  console.log("Portal freshness regressions passed: revision changes, foreground, signed-out/background pause, moderation deferral and late-response protection.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
