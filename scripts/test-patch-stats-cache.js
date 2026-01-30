#!/usr/bin/env node
/**
 * Tests the patched ODK function from cli.js by extracting it
 * and running it with mocked React/Ink dependencies.
 *
 * Usage: node scripts/test-patch-stats-cache.js [path-to-cli.js]
 */

var fs = require("fs");

var cliPath = process.argv[2] ||
  "/opt/node22/lib/node_modules/@anthropic-ai/claude-code/cli.js";

// Mock dependencies
var React = {
  createElement: function(type, props) {
    var children = Array.prototype.slice.call(arguments, 2);
    return { type: typeof type === "string" ? type : "component", props: props, children: children };
  }
};
var D4 = { default: React };
var f = "Text";
var I = "Box";
var aA = { bullet: "\u2022" };
function a(n) { return new Array(n).fill(Symbol.for("react.memo_cache_sentinel")); }
function sj(m) { return m; }
function M3(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// Extract ODK from cli.js
var src = fs.readFileSync(cliPath, "utf8");
var idx = src.indexOf("function ODK(A)");
if (idx === -1) { console.error("ODK not found"); process.exit(1); }
var d = 0, i = idx, end = -1;
while (i < src.length && i < idx + 10000) {
  if (src[i] === "{") d++;
  else if (src[i] === "}") { d--; if (d === 0) { end = i; break; } }
  i++;
}
var fnSrc = src.slice(idx, end + 1);
var ODK = new Function("a", "sj", "M3", "D4", "f", "I", "aA",
  "return " + fnSrc)(a, sj, M3, D4, f, I, aA);

// Helpers
function render(el) {
  if (el === null || el === undefined) return "";
  if (typeof el === "string" || typeof el === "number") return String(el);
  var out = "";
  if (el.children) el.children.forEach(function(c) { out += render(c); });
  return out;
}

function getLines(result) {
  var lines = [];
  result.children.forEach(function(c) { if (c) lines.push(render(c)); });
  return lines;
}

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  \u2713 " + msg); }
  else { failed++; console.log("  \u2717 FAIL: " + msg); }
}

// Test 1: With cache data
console.log("\nTest 1: With cache data");
var r1 = getLines(ODK({
  model: "claude-sonnet-4-20250514",
  usage: { inputTokens: 1200000, outputTokens: 45000, cacheReadInputTokens: 890000, cacheCreationInputTokens: 312000 },
  totalTokens: 2447000
}));
r1.forEach(function(l) { console.log("    " + l); });
assert(r1.length === 4, "Should have 4 lines (header, in/out, cache, hit rate)");
assert(r1[2].indexOf("Cache R:") >= 0, "Line 3 contains 'Cache R:'");
assert(r1[2].indexOf("Cache W:") >= 0, "Line 3 contains 'Cache W:'");
assert(r1[3].indexOf("Cache hit:") >= 0, "Line 4 contains 'Cache hit:'");
assert(r1[3].indexOf("37%") >= 0, "Hit rate is 37%");

// Test 2: No cache data
console.log("\nTest 2: No cache data (zero values)");
var r2 = getLines(ODK({
  model: "claude-sonnet-4-20250514",
  usage: { inputTokens: 500000, outputTokens: 20000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
  totalTokens: 520000
}));
r2.forEach(function(l) { console.log("    " + l); });
assert(r2.length === 2, "Should have 2 lines (no cache lines)");

// Test 3: Cache writes only
console.log("\nTest 3: Cache writes only (0% hit rate)");
var r3 = getLines(ODK({
  model: "claude-haiku-3.5",
  usage: { inputTokens: 100000, outputTokens: 5000, cacheReadInputTokens: 0, cacheCreationInputTokens: 50000 },
  totalTokens: 155000
}));
r3.forEach(function(l) { console.log("    " + l); });
assert(r3.length === 4, "Should have 4 lines");
assert(r3[3].indexOf("0%") >= 0, "Hit rate is 0%");

// Test 4: Undefined cache fields (backward compat)
console.log("\nTest 4: Undefined cache fields");
var r4 = getLines(ODK({
  model: "claude-opus-4-20250514",
  usage: { inputTokens: 200000, outputTokens: 10000 },
  totalTokens: 210000
}));
r4.forEach(function(l) { console.log("    " + l); });
assert(r4.length === 2, "Should have 2 lines (undefined = no cache)");

// Test 5: 100% cache hit
console.log("\nTest 5: 100% cache hit rate");
var r5 = getLines(ODK({
  model: "claude-sonnet-4-20250514",
  usage: { inputTokens: 0, outputTokens: 1000, cacheReadInputTokens: 500000, cacheCreationInputTokens: 0 },
  totalTokens: 501000
}));
r5.forEach(function(l) { console.log("    " + l); });
assert(r5.length === 4, "Should have 4 lines");
assert(r5[3].indexOf("100%") >= 0, "Hit rate is 100%");

// Summary
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
