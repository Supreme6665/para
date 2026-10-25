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

test("defaults include the section and synonym game records", () => {
  const storage = loadWith(fakeStorage());
  const state = storage.load();

  assert.equal(state.section, "paraphrase");
  assert.equal(state.settings.synonymSeconds, 60);
  assert.equal(state.settings.synonymReview, true);
  assert.deepEqual(state.synonymGame, {
    highScore: 0,
    bestStreak: 0,
    rounds: 0,
    lastScore: 0,
    lastAt: null
  });
});

test("older saved state is merged with new defaults", () => {
  const saved = JSON.stringify({
    version: 1,
    settings: { mode: "weak", limit: 10 },
    progress: { "acjc-p1-q1": { attempts: 1, correct: 0 } },
    stats: { attempts: 1, correct: 0 }
  });
  const storage = loadWith(fakeStorage({ "peridot.v1": saved }));
  const state = storage.load();

  assert.equal(state.settings.mode, "weak");
  assert.equal(state.settings.limit, 10);
  assert.equal(state.settings.synonymSeconds, 60);
  assert.equal(state.settings.synonymReview, true);
  assert.equal(state.section, "paraphrase");
  assert.equal(state.synonymGame.highScore, 0);
  assert.equal(state.progress["acjc-p1-q1"].attempts, 1);
});

test("an explicit review-mode preference is preserved", () => {
  const saved = JSON.stringify({
    version: 1,
    settings: { synonymReview: false },
    progress: {},
    stats: {}
  });
  const storage = loadWith(fakeStorage({ "peridot.v1": saved }));
  const state = storage.load();

  assert.equal(state.settings.synonymReview, false);
  assert.equal(state.settings.synonymSeconds, 60);
});

test("imported backups keep game records and restore defaults for missing fields", () => {
  const storage = loadWith(fakeStorage());
  const state = storage.importJSON(JSON.stringify({
    version: 1,
    progress: {},
    section: "synonyms",
    synonymGame: { highScore: 84, bestStreak: 6, rounds: 3, lastScore: 42 }
  }));

  assert.equal(state.section, "synonyms");
  assert.equal(state.synonymGame.highScore, 84);
  assert.equal(state.synonymGame.lastAt, null);
  assert.equal(state.settings.synonymSeconds, 60);
  assert.equal(state.settings.synonymReview, true);
});
