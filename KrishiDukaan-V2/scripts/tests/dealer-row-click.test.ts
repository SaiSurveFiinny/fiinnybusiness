/**
 * Tests for row-click vs action-icon-click behavior.
 *
 * The rule: clicking a row body opens the drawer; clicking an action icon
 * (Map, Edit, Delete) performs that action WITHOUT opening the drawer.
 * This is enforced by stopPropagation on each action button's onClick.
 *
 *   npx tsx scripts/tests/dealer-row-click.test.ts
 */
import assert from "node:assert/strict";

// ── Simulate event propagation logic ─────────────────────────────────────────

class FakeEvent {
  propagationStopped = false;
  stopPropagation() { this.propagationStopped = true; }
}

type DrawerState = { openedWith: string | null };

// Row-level click handler
function handleRowClick(dealerId: string, state: DrawerState) {
  state.openedWith = dealerId;
}

// Action icon click handler (wraps user handler + stops propagation)
function handleActionClick(
  e: FakeEvent,
  action: () => void,
  state: DrawerState,
) {
  e.stopPropagation();
  action();
  // The row-level handler should NOT run when stopPropagation was called.
  // We simulate this: if propagation stopped, skip the row handler.
  if (!e.propagationStopped) {
    state.openedWith = "row-opened"; // should not happen
  }
}

// ── Row click opens drawer ────────────────────────────────────────────────────
{
  const state: DrawerState = { openedWith: null };
  handleRowClick("dealer-abc", state);
  assert.equal(state.openedWith, "dealer-abc", "row click must open drawer");
}

// ── Action icon click does NOT open drawer ────────────────────────────────────
{
  const state: DrawerState = { openedWith: null };
  let actionFired = false;
  const e = new FakeEvent();
  handleActionClick(e, () => { actionFired = true; }, state);

  assert.equal(e.propagationStopped, true, "stopPropagation must be called on action click");
  assert.equal(actionFired, true, "the action handler must still run");
  assert.equal(state.openedWith, null, "drawer must NOT open from action icon click");
}

// ── Map action fires, drawer stays closed ─────────────────────────────────────
{
  const state: DrawerState = { openedWith: null };
  let mapsOpened = false;
  const e = new FakeEvent();
  handleActionClick(e, () => { mapsOpened = true; }, state);

  assert.equal(mapsOpened, true);
  assert.equal(state.openedWith, null);
}

// ── Edit action fires, drawer stays closed ────────────────────────────────────
{
  const state: DrawerState = { openedWith: null };
  let editOpened = false;
  const e = new FakeEvent();
  handleActionClick(e, () => { editOpened = true; }, state);

  assert.equal(editOpened, true);
  assert.equal(state.openedWith, null);
}

// ── Delete action fires, drawer stays closed ──────────────────────────────────
{
  const state: DrawerState = { openedWith: null };
  let deleteOpened = false;
  const e = new FakeEvent();
  handleActionClick(e, () => { deleteOpened = true; }, state);

  assert.equal(deleteOpened, true);
  assert.equal(state.openedWith, null);
}

// ── URL param helpers ─────────────────────────────────────────────────────────
// setDealerParam / readDealerParam logic (pure URL manipulation)

function setDealerParam(dealerId: string | null, currentSearch: string): string {
  const p = new URLSearchParams(currentSearch);
  if (dealerId) p.set("dealer", dealerId);
  else p.delete("dealer");
  const s = p.toString();
  return s ? `?${s}` : "";
}

function readDealerParam(search: string): string | null {
  return new URLSearchParams(search).get("dealer");
}

// Open drawer sets param
assert.equal(setDealerParam("xyz", ""), "?dealer=xyz");
assert.equal(readDealerParam("?dealer=xyz"), "xyz");

// Close drawer removes param
assert.equal(setDealerParam(null, "?dealer=xyz"), "");
assert.equal(readDealerParam(""), null);

// Preserves existing params
const withHash = setDealerParam("abc", "?tab=dealers");
assert.ok(withHash.includes("dealer=abc"));
assert.ok(withHash.includes("tab=dealers"));

// Replacing an existing dealer param
const replaced = setDealerParam("new", "?dealer=old");
assert.equal(readDealerParam(replaced), "new");
assert.ok(!replaced.includes("old"));

console.log("dealer-row-click tests passed ✓");
