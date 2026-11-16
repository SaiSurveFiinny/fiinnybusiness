/**
 * The store list behind /stores/* must never turn a failed read into an empty
 * list (that becomes a cached 404 on every store page), and must refresh so
 * newly added shops get pages. Run: npx tsx scripts/tests/stale-cache.test.ts
 */
import assert from "node:assert/strict";
import { staleWhileErrorCache } from "../../app/lib/seo/stale-cache";

async function main() {
  let t = 0;
  const now = () => t;

  // 1. First read fails with nothing cached → the error propagates (no []).
  {
    const get = staleWhileErrorCache(async () => {
      throw new Error("directory mid-rebuild");
    }, 1000, { now });
    await assert.rejects(get(), /mid-rebuild/);
  }

  // 2. Fresh within TTL, reloads after it (new shops appear).
  {
    let calls = 0;
    const get = staleWhileErrorCache(async () => [`v${++calls}`], 1000, { now });
    t = 0;
    assert.deepEqual(await get(), ["v1"]);
    t = 999;
    assert.deepEqual(await get(), ["v1"]);
    assert.equal(calls, 1);
    t = 1000;
    assert.deepEqual(await get(), ["v2"]);
    assert.equal(calls, 2);
  }

  // 3. A failed refresh serves the last good list, then recovers.
  {
    let fail = false;
    let calls = 0;
    let staleServes = 0;
    const get = staleWhileErrorCache(
      async () => {
        calls++;
        if (fail) throw new Error("boom");
        return ["good"];
      },
      1000,
      { now, onStaleServe: () => staleServes++ },
    );
    t = 0;
    assert.deepEqual(await get(), ["good"]);
    fail = true;
    t = 5000;
    assert.deepEqual(await get(), ["good"]);
    assert.equal(staleServes, 1);
    // The failure did not refresh the timestamp: the next call retries.
    assert.deepEqual(await get(), ["good"]);
    assert.equal(calls, 3);
    fail = false;
    assert.deepEqual(await get(), ["good"]);
    assert.equal(calls, 4);
    // Now fresh again: no further read.
    await get();
    assert.equal(calls, 4);
  }

  // 4. Concurrent callers share a single load.
  {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const get = staleWhileErrorCache(async () => {
      calls++;
      await gate;
      return ["x"];
    }, 1000, { now });
    t = 0;
    const all = Promise.all([get(), get(), get()]);
    release();
    assert.deepEqual(await all, [["x"], ["x"], ["x"]]);
    assert.equal(calls, 1);
  }

  console.log("stale-cache: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
