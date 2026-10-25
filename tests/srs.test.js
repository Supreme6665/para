"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

global.window = {};
require(path.join(__dirname, "..", "js", "srs.js"));
const SRS = window.ParaSRS;

function card(id, paper, type) {
  return { id, paper, questionType: type };
}

const cards = [
  card("a", "P1", "vocab"),
  card("b", "P1", "figurative"),
  card("c", "P2", "vocab"),
  card("d", "P2", "language"),
  card("e", "P3", "term")
];

test("addDays handles month, leap-year and year boundaries", () => {
  assert.equal(SRS.addDays("2026-10-25", 1), "2026-10-26");
  assert.equal(SRS.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(SRS.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(SRS.addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(SRS.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(SRS.addDays("2026-01-01", 16), "2026-01-17");
});

test("a cold card is due", () => {
  assert.equal(SRS.isDue(undefined, "2026-10-25"), true);
  assert.equal(SRS.isDue({}, "2026-10-25"), true);
});

test("due dates are inclusive of today", () => {
  assert.equal(SRS.isDue({ due: "2026-10-25" }, "2026-10-25"), true);
  assert.equal(SRS.isDue({ due: "2026-10-26" }, "2026-10-25"), false);
  assert.equal(SRS.isDue({ due: "2026-10-24" }, "2026-10-25"), true);
});

test("a correct answer promotes the card one box", () => {
  const first = SRS.review(null, { score: 2, max: 2, verdict: "correct" }, "2026-10-25");
  assert.deepEqual(
    {
      attempts: first.attempts,
      correct: first.correct,
      box: first.box,
      due: first.due,
      lastScore: first.lastScore,
      lastMax: first.lastMax,
      lastSeen: first.lastSeen,
      lastVerdict: first.lastVerdict
    },
    {
      attempts: 1,
      correct: 1,
      box: 1,
      due: "2026-10-26",
      lastScore: 2,
      lastMax: 2,
      lastSeen: "2026-10-25",
      lastVerdict: "correct"
    }
  );

  const second = SRS.review(first, { score: 2, max: 2, verdict: "correct" }, "2026-10-26");
  assert.equal(second.box, 2);
  assert.equal(second.due, "2026-10-29");
  assert.equal(second.attempts, 2);
  assert.equal(second.correct, 2);
});

test("a complete miss resets the card to box zero", () => {
  const promoted = { attempts: 4, correct: 3, box: 3 };
  const next = SRS.review(promoted, { score: 0, max: 2, verdict: "miss" }, "2026-10-25");
  assert.equal(next.box, 0);
  assert.equal(next.due, "2026-10-25");
  assert.equal(next.attempts, 5);
  assert.equal(next.correct, 3);
  assert.equal(next.lastVerdict, "miss");
});

test("a partial answer keeps the current box", () => {
  const promoted = { attempts: 2, correct: 2, box: 2 };
  const next = SRS.review(promoted, { score: 1, max: 2, verdict: "partial" }, "2026-10-25");
  assert.equal(next.box, 2);
  assert.equal(next.due, "2026-10-28");
  assert.equal(next.attempts, 3);
  assert.equal(next.correct, 2);
  assert.equal(next.lastVerdict, "partial");
});

test("the box cannot grow beyond the interval table", () => {
  let record = null;
  let day = "2026-01-01";
  for (let i = 0; i < 10; i++) {
    record = SRS.review(record, { score: 1, max: 1, verdict: "correct" }, day);
    day = record.due;
  }
  assert.equal(record.box, SRS.intervals.length - 1);
  assert.equal(record.correct, 10);
});

test("practice mode filters by paper and type", () => {
  const queue = SRS.buildQueue(
    cards,
    { mode: "practice", papers: ["P1"], types: ["vocab"], limit: 0 },
    {},
    "2026-10-25"
  );
  assert.deepEqual(queue.ids, ["a"]);
  assert.equal(queue.notice, "");
});

test("an empty selection of filters means everything", () => {
  const queue = SRS.buildQueue(
    cards,
    { mode: "practice", papers: [], types: [], limit: 0 },
    {},
    "2026-10-25"
  );
  assert.equal(queue.ids.length, cards.length);
  assert.deepEqual([...queue.ids].sort(), ["a", "b", "c", "d", "e"]);
});

test("limit caps the queue without dropping the pool", () => {
  const queue = SRS.buildQueue(
    cards,
    { mode: "practice", papers: [], types: [], limit: 3 },
    {},
    "2026-10-25"
  );
  assert.equal(queue.ids.length, 3);
  assert.equal(new Set(queue.ids).size, 3);
});

test("due mode chooses only cards due today", () => {
  const progress = {
    a: { due: "2026-10-25" },
    b: { due: "2026-11-01" },
    c: { due: "2026-10-20" },
    d: { due: "2026-10-24" },
    e: { due: "2026-12-01" }
  };
  const queue = SRS.buildQueue(
    cards,
    { mode: "due", papers: [], types: [], limit: 0 },
    progress,
    "2026-10-25"
  );
  assert.deepEqual([...queue.ids].sort(), ["a", "c", "d"]);
  assert.equal(queue.notice, "");
});

test("due mode falls back to the selection when nothing is due", () => {
  const progress = {
    a: { due: "2026-11-01" },
    b: { due: "2026-11-02" },
    c: { due: "2026-11-03" },
    d: { due: "2026-11-04" },
    e: { due: "2026-11-05" }
  };
  const queue = SRS.buildQueue(
    cards,
    { mode: "due", papers: [], types: [], limit: 0 },
    progress,
    "2026-10-25"
  );
  assert.equal(queue.ids.length, cards.length);
  assert.match(queue.notice, /No cards are due/);
});

test("weak mode selects low-accuracy and low-box cards", () => {
  const progress = {
    a: { attempts: 4, correct: 1, box: 2 },
    b: { attempts: 4, correct: 4, box: 3 },
    c: { attempts: 2, correct: 2, box: 1 },
    d: { attempts: 1, correct: 1, box: 4 }
  };
  const queue = SRS.buildQueue(
    cards,
    { mode: "weak", papers: [], types: [], limit: 0 },
    progress,
    "2026-10-25"
  );
  assert.deepEqual([...queue.ids].sort(), ["a", "c"]);
  assert.equal(queue.notice, "");
});

test("weak mode ignores cards that have never been attempted", () => {
  const queue = SRS.buildQueue(
    cards,
    { mode: "weak", papers: [], types: [], limit: 0 },
    {},
    "2026-10-25"
  );
  assert.equal(queue.ids.length, cards.length);
  assert.match(queue.notice, /No weak spots/);
});

test("no matching cards produces an explanatory notice", () => {
  const queue = SRS.buildQueue(
    cards,
    { mode: "practice", papers: ["P9"], types: [], limit: 0 },
    {},
    "2026-10-25"
  );
  assert.deepEqual(queue.ids, []);
  assert.match(queue.notice, /No cards match/);
});

test("shuffle keeps the same elements and does not mutate its input", () => {
  const source = ["a", "b", "c", "d", "e"];
  const copy = source.slice();
  const shuffled = SRS.shuffle(source);
  assert.deepEqual(source, copy);
  assert.deepEqual([...shuffled].sort(), copy);
  assert.equal(shuffled.length, source.length);
});

test("todayISO returns a local YYYY-MM-DD date", () => {
  assert.match(SRS.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
