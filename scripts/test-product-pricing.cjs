const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "provider.js"), "utf8");
const declarations = [...source.matchAll(/^  (?:async )?function (\w+)\(/gm)];
function extract(name) {
  const index = declarations.findIndex(match => match[1] === name);
  assert.ok(index >= 0, `Missing ${name}`);
  return source.slice(declarations[index].index, declarations[index + 1]?.index || source.length);
}
const values = {
  local_selling_price: "100", compare_at_price: "", flash_sale_price: "",
  currency_code: "NGN", inventory_country_code: "NG", fulfillment_mode: "merchant_cross_border",
  delivery_min_days: "1", delivery_max_days: "3", delivery_areas: "NG | | | 20 | 5 | NGN\nUS | | | 30 | 10 | USD"
};
const form = { reportValidity: () => true, elements: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) };
form.elements.is_flash_sale = { checked: false };
const nodes = { productForm: form, productPriceGuidance: {}, usePrimaryDeliveryPrices: {} };
const context = vm.createContext({ $: id => nodes[id], FormData: class {
  *[Symbol.iterator]() { for (const [key, input] of Object.entries(form.elements)) if ("value" in input) yield [key, input.value]; }
} });
vm.runInContext(["validatedProductValues", "updateProductPriceGuidance", "usePrimaryDeliveryPrices"].map(extract).join("\n"), context);
const validate = () => context.validatedProductValues(form);
assert.equal(validate().delivery_areas[0].item_price, 20, "an explicitly separate price stays separate");
context.usePrimaryDeliveryPrices();
assert.match(form.elements.delivery_areas.value, /NG\s*\|\s*\|\s*\|\s*primary\s*\|\s*5\s*\|\s*NGN/);
assert.match(form.elements.delivery_areas.value, /US \| \| \| 30 \| 10 \| USD/);
assert.equal(validate().delivery_areas[0].item_price, 100);
assert.equal(validate().delivery_areas[0].uses_primary_price, true);
form.elements.local_selling_price.value = "200";
assert.equal(validate().delivery_areas[0].item_price, 200, "future edits must follow the main price without editing the delivery row");
assert.equal(validate().delivery_areas[0].delivery_fee, 5);
assert.equal(validate().delivery_areas[1].item_price, 30);
form.elements.delivery_areas.value = "US | | | primary | 10 | USD";
assert.throws(validate, /primary currency/);
console.log("Provider pricing regressions passed: repair price links, follow later edits, preserve delivery fees and independent foreign prices.");
