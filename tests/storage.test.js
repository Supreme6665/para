"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const STORAGE = path.join(__dirname, "..", "js", "storage.js");

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function loadWith(store) {
  global.window = { localStorage: store };
  delete require.cache[require.resolve(STORAGE)];
  require(STORAGE);
  return global.window.PeridotStorage;
}

test("progress saved under the old para.v1 key is migrated to peridot.v1", () => {
  const saved = JSON.stringify({
    version: 1,
    progress: { "acjc-p1-q1": { attempts: 2, correct: 1 } },
    stats: { attempts: 2, correct: 1 }
  });
  const store = fakeStorage({ "para.v1": saved });
  const storage = loadWith(store);

  const state = storage.load();
  assert.equal(state.progress["acjc-p1-q1"].attempts, 2);
  assert.equal(state.stats.attempts, 2);
  assert.equal(store.getItem("peridot.v1"), saved);
  assert.equal(store.getItem("para.v1"), null);
});

test("new progress is written to peridot.v1", () => {
  const store = fakeStorage();
  const storage = loadWith(store);
  const state = storage.load();

  state.progress["acjc-p1-q1"] = { attempts: 1, correct: 1 };
  assert.equal(storage.save(state), true);

  const written = JSON.parse(store.getItem("peridot.v1"));
  assert.equal(written.progress["acjc-p1-q1"].attempts, 1);
  assert.equal(store.getItem("para.v1"), null);
});
