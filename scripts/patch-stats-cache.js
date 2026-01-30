#!/usr/bin/env node
/**
 * Patches the compiled Claude Code cli.js to add cache token stats
 * (cache read, cache write, cache hit rate) to the /stats Models tab.
 *
 * Usage: node scripts/patch-stats-cache.js [path-to-cli.js]
 *
 * Default path: /opt/node22/lib/node_modules/@anthropic-ai/claude-code/cli.js
 */

var fs = require("fs");
var path = require("path");

var cliPath = process.argv[2] ||
  "/opt/node22/lib/node_modules/@anthropic-ai/claude-code/cli.js";

if (!fs.existsSync(cliPath)) {
  console.error("cli.js not found at:", cliPath);
  process.exit(1);
}

var src = fs.readFileSync(cliPath, "utf8");

// Locate the ODK function (per-model usage card in /stats Models tab)
var idx = src.indexOf("function ODK(A)");
if (idx === -1) {
  console.error("ERROR: function ODK(A) not found in cli.js. Is this the right file?");
  process.exit(1);
}

// Extract the full function by brace-matching
var d = 0, i = idx, end = -1;
while (i < src.length && i < idx + 10000) {
  if (src[i] === "{") d++;
  else if (src[i] === "}") { d--; if (d === 0) { end = i; break; } }
  i++;
}
if (end === -1) {
  console.error("ERROR: Could not find end of ODK function");
  process.exit(1);
}

var oldFn = src.slice(idx, end + 1);

// Check if already patched
if (oldFn.indexOf("cacheReadInputTokens") >= 0) {
  console.log("Already patched. Nothing to do.");
  process.exit(0);
}

// Find the cut point: the final assembly of the Box element (slots 18-20)
var cutMarker = "let j;if(K[18]";
var cutPoint = oldFn.indexOf(cutMarker);
if (cutPoint === -1) {
  console.error("ERROR: Could not find final assembly marker in ODK function.");
  console.error("The function may have changed. Manual inspection required.");
  process.exit(1);
}

var keepPart = oldFn.slice(0, cutPoint);

// New tail: compute cache stats and add them as extra children in the Box
var newTail = [
  "var _cr=Y.cacheReadInputTokens||0,_cw=Y.cacheCreationInputTokens||0,",
  "_hc=_cr>0||_cw>0,",
  "_ti=Y.inputTokens+_cr+_cw,",
  '_hp=_ti>0?(_cr/_ti*100).toFixed(0):null,',
  "_cEl=null,_hEl=null;",
  'if(_hc)_cEl=D4.default.createElement(f,{color:"subtle"},',
  '"  Cache R: ",M3(_cr)," \\u00b7 Cache W: ",M3(_cw));',
  'if(_hc&&_hp!==null)_hEl=D4.default.createElement(f,{color:"subtle"},',
  '"  Cache hit: ",_hp,"%");',
  'var j=D4.default.createElement(I,{flexDirection:"column"},Z,D,_cEl,_hEl);',
  "return j}"
].join("");

var newFn = keepPart + newTail;

// Apply patch
var backupPath = cliPath + ".bak";
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(cliPath, backupPath);
  console.log("Backup saved to:", backupPath);
}

var newSrc = src.replace(oldFn, newFn);
fs.writeFileSync(cliPath, newSrc);

console.log("Patch applied successfully.");
console.log("  Old function: " + oldFn.length + " chars");
console.log("  New function: " + newFn.length + " chars");
console.log("  Added: " + (newFn.length - oldFn.length) + " chars");
console.log("");
console.log("The /stats Models tab will now show:");
console.log("  • Model Name (XX.X%)");
console.log("    In: XXK · Out: XXK · Cache R: XXK · Cache W: XXK");
console.log("    Cache hit: XX%");
