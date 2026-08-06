import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigCache } from "../src/cache.js";

test("single write then read returns the value", () => {
  const cache = new ConfigCache();
  cache.put("theme", "dark");
  assert.equal(cache.get("theme"), "dark");
});

test("second write to the same key must return the NEW value (regression)", () => {
  const cache = new ConfigCache();
  cache.put("theme", "dark");
  cache.put("theme", "light"); // was dropped before the fix
  assert.equal(cache.get("theme"), "light");
});

test("readVersion reflects the latest put", () => {
  const cache = new ConfigCache();
  cache.put("a", 1);
  const v1 = cache.readVersion("a");
  cache.put("a", 2);
  const v2 = cache.readVersion("a");
  assert.ok(v2 > v1);
});
