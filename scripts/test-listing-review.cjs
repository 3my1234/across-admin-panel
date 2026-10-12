const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const g={window:{}};vm.runInNewContext(fs.readFileSync("listing-review.js","utf8"),g);const render=g.window.ListingReview.render;
const html=render({has_approved_baseline:true,changes_since_approval:[{label:"title",before:"Old",after:'<img src=x onerror=alert(1)>'},{label:"price",before:100,after:200}]});
assert.match(html,/2 changes/);assert.match(html,/Last approved/);assert.match(html,/Submitted now/);assert.ok(!html.includes('<img src=x'));assert.match(html,/&lt;img/);
assert.match(render({published_at:"2026-10-12"}),/Earlier approved content was not recorded/);assert.match(render({}),/New listing/);assert.match(render({has_approved_baseline:true,changes_since_approval:[]}),/No differences/);console.log("Listing review passed: before/after details, escaped edits, legacy baseline disclosure and first submissions.");
