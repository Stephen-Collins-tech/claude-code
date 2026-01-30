# Plan: Add Cache Token Stats to `/stats` Models Tab

## Problem

The `/stats` Models tab (`ODK` component) displays per-model token usage but omits
prompt cache data. The `usage` object passed to `ODK` already contains
`cacheReadInputTokens` and `cacheCreationInputTokens` — they are collected for all
users (API and subscription) via `pd6()` and facet aggregation — but the component
only renders `inputTokens` and `outputTokens`.

### Current output

```
• Sonnet 4 (85.2%)
  In: 1.2M · Out: 45K
```

### Proposed output

```
• Sonnet 4 (85.2%)
  In: 1.2M · Out: 45K · Cache R: 890K · Cache W: 312K
  Cache hit: 67%
```

## Scope

One component change: `ODK` (the per-model usage card in the `/stats` Models tab).

No changes to `/cost`, no changes to pricing display, no new commands.

## Implementation

### Location

The `ODK` component in the source (minified name in `cli.js`). In the original
TypeScript source, this is the component rendered for each model entry in the
Models tab of the `/stats` command.

### Current component (decompiled from minified)

```tsx
function ODK({ model, usage, totalTokens }) {
  const pct = ((usage.inputTokens + usage.outputTokens) / totalTokens * 100).toFixed(1);
  const modelName = sj(model);

  return (
    <Box flexDirection="column">
      <Text>
        {bullet} <Text bold>{modelName}</Text> <Text color="subtle">({pct}%)</Text>
      </Text>
      <Text color="subtle">
        {"  "}In: {M3(usage.inputTokens)} · Out: {M3(usage.outputTokens)}
      </Text>
    </Box>
  );
}
```

### Proposed change

```tsx
function ODK({ model, usage, totalTokens }) {
  const pct = ((usage.inputTokens + usage.outputTokens) / totalTokens * 100).toFixed(1);
  const modelName = sj(model);

  const hasCacheData = usage.cacheReadInputTokens > 0 || usage.cacheCreationInputTokens > 0;

  const totalInput = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const cacheHitPct = totalInput > 0
    ? (usage.cacheReadInputTokens / totalInput * 100).toFixed(0)
    : null;

  return (
    <Box flexDirection="column">
      <Text>
        {bullet} <Text bold>{modelName}</Text> <Text color="subtle">({pct}%)</Text>
      </Text>
      <Text color="subtle">
        {"  "}In: {M3(usage.inputTokens)} · Out: {M3(usage.outputTokens)}
        {hasCacheData && ` · Cache R: ${M3(usage.cacheReadInputTokens)} · Cache W: ${M3(usage.cacheCreationInputTokens)}`}
      </Text>
      {cacheHitPct !== null && (
        <Text color="subtle">
          {"  "}Cache hit: {cacheHitPct}%
        </Text>
      )}
    </Box>
  );
}
```

### What changes

1. **Add `hasCacheData` guard** — only show cache tokens when at least one is > 0.
   Avoids noise for models or sessions with no caching.

2. **Append cache read/write to the existing token line** — uses the same `M3()`
   compact number formatter (e.g. "890K") and same `· ` separator style.

3. **Add a cache hit rate line** — `cacheRead / (input + cacheRead + cacheCreation) * 100`.
   This matches the formula already used in telemetry (`cacheHitRate` in
   `tengu_fork_agent_query`). Only shown when `totalInput > 0` to avoid division
   by zero.

### What does NOT change

- **Data collection** — `pd6()` already accumulates `cache_read_input_tokens` and
  `cache_creation_input_tokens` for all users. No change needed.
- **Facet storage** — `v16()` already persists cache token counts to disk. No change.
- **Facet aggregation** — The stats aggregation code already sums cache tokens per
  model across sessions. No change.
- **`/cost` command** — Remains hidden for subscription users. Out of scope.
- **Dollar amounts** — Not shown. Out of scope.
- **`/stats` Overview tab** — Not modified. Could be a follow-up.

## Edge cases

| Case | Behavior |
|------|----------|
| Caching disabled (`DISABLE_PROMPT_CACHING=1`) | Both cache fields are 0, `hasCacheData` is false, cache line hidden |
| Model with zero cache tokens | Cache line suppressed, only `In / Out` shown |
| All tokens from cache (100% hit) | Shows `Cache hit: 100%` |
| Only cache writes, no reads | Shows `Cache R: 0 · Cache W: 312K` and `Cache hit: 0%` |
| Division by zero (no input at all) | `cacheHitPct` is `null`, line not rendered |
| Historical sessions without cache fields | Defensive `> 0` check handles `undefined` (falsy) |

## Dependencies

None. The `usage` prop already carries the required fields. The `M3()` formatter
is already in scope within the component's module.

## Testing

- Verify `ODK` renders cache line only when cache data > 0
- Verify cache hit rate math: `890000 / (1200000 + 890000 + 312000) * 100 ≈ 37%`
- Verify zero-data case renders only `In / Out`
- Verify both API and subscription users see cache data in `/stats`
