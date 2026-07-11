/**
 * Standalone test for the deduped cache that backs brand-logo lookups. This is the
 * credit-burn safeguard from issue #11, so we prove — without touching the network —
 * that repeated/concurrent requests never fan out into repeated loads.
 *
 * Run: npx tsx scripts/test-deduped-cache.ts
 */
import assert from "node:assert/strict";
import { createDedupedCache } from "../src/lib/deduped-cache";

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

/** A loader that counts how many times each key was actually loaded. */
function countingLoader<V>(map: Record<string, V>, delayMs = 0) {
  const calls: Record<string, number> = {};
  const load = async (key: string): Promise<V> => {
    calls[key] = (calls[key] ?? 0) + 1;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return map[key];
  };
  return { load, calls };
}

async function main() {
  console.log("deduped-cache");

  await test("concurrent requests for one key load it exactly once", async () => {
    const cache = createDedupedCache<string>({ ttlMs: 10_000 });
    const { load, calls } = countingLoader({ "openai.com": "logo-a" }, 20);
    const results = await Promise.all(
      Array.from({ length: 100 }, () => cache.get("openai.com", load)),
    );
    assert.equal(calls["openai.com"], 1, "expected a single load for 100 concurrent callers");
    assert.ok(results.every((r) => r === "logo-a"), "all callers get the same value");
  });

  await test("repeated sequential requests within TTL never reload (refresh/HMR case)", async () => {
    let clock = 0;
    const cache = createDedupedCache<string>({ ttlMs: 10_000, now: () => clock });
    const { load, calls } = countingLoader({ "stripe.com": "logo-b" });
    // Simulate 50 page renders / hot-reloads over 5 seconds.
    for (let i = 0; i < 50; i++) {
      clock += 100;
      const v = await cache.get("stripe.com", load);
      assert.equal(v, "logo-b");
    }
    assert.equal(calls["stripe.com"], 1, "50 renders must cost exactly one load");
  });

  await test("value is reloaded only after the TTL expires", async () => {
    let clock = 0;
    const cache = createDedupedCache<string>({ ttlMs: 1_000, now: () => clock });
    const { load, calls } = countingLoader({ "vercel.com": "logo-c" });
    await cache.get("vercel.com", load);
    clock += 500; // still fresh
    await cache.get("vercel.com", load);
    assert.equal(calls["vercel.com"], 1, "no reload before TTL");
    clock += 1_000; // now expired
    await cache.get("vercel.com", load);
    assert.equal(calls["vercel.com"], 2, "one reload after TTL");
  });

  await test("distinct keys each load once; a mixed burst is deduped per key", async () => {
    const cache = createDedupedCache<string>({ ttlMs: 10_000 });
    const domains = ["a.com", "b.com", "c.com"];
    const { load, calls } = countingLoader({ "a.com": "1", "b.com": "2", "c.com": "3" }, 10);
    // 30 callers spread across 3 keys, all at once.
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => cache.get(domains[i % 3], load)),
    );
    assert.deepEqual(calls, { "a.com": 1, "b.com": 1, "c.com": 1 });
    assert.equal(cache.size, 3);
  });

  await test("failed loads are not cached and are retried on the next request", async () => {
    const cache = createDedupedCache<string>({ ttlMs: 10_000 });
    let attempts = 0;
    const flaky = async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return "recovered";
    };
    await assert.rejects(() => cache.get("hn.com", flaky), /transient/);
    const v = await cache.get("hn.com", flaky); // should retry, not serve a poisoned entry
    assert.equal(v, "recovered");
    assert.equal(attempts, 2, "error must not be cached");
    assert.equal(cache.size, 1);
  });

  await test("null results are cached (a domain with no logo isn't refetched)", async () => {
    const cache = createDedupedCache<string | null>({ ttlMs: 10_000 });
    let calls = 0;
    const load = async () => {
      calls++;
      return null;
    };
    assert.equal(await cache.get("nologo.com", load), null);
    assert.equal(await cache.get("nologo.com", load), null);
    assert.equal(calls, 1, "a cached null still counts as a hit");
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((err) => {
  console.error("\nTEST FAILED:", err);
  process.exit(1);
});
