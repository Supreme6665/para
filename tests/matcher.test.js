"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
global.window = {};
require(path.join(ROOT, "js", "synonyms.js"));
require(path.join(ROOT, "js", "data.js"));
const { createMatcher } = require(path.join(ROOT, "js", "matcher.js"));

const matcher = createMatcher({ synonymGroups: window.PARA_SYNONYMS.groups });
const byId = Object.fromEntries(window.PARA_DATA.cards.map((card) => [card.id, card]));

function grade(id, answer) {
  return matcher.grade(byId[id], answer);
}

test("normalises case, punctuation and contractions", () => {
  assert.equal(
    matcher.normalize("  It’s NOT   fair—isn’t it? "),
    "it is not fair is not it"
  );
  assert.deepEqual(matcher.tokenize("Money doesn't buy happiness."), ["money", "does", "not", "buy", "happiness"]);
});

test("stems inflections consistently", () => {
  assert.equal(matcher.stem("destroyed"), matcher.stem("destroy"));
  assert.equal(matcher.stem("societies"), matcher.stem("society"));
  assert.equal(matcher.stem("pressured"), matcher.stem("pressure"));
});

test("a full model answer scores full marks", () => {
  const result = grade(
    "acjc-p1-q5-asymmetry",
    "Trust is imbalanced: it takes a long time to build but can be destroyed very quickly."
  );
  assert.equal(result.verdict, "correct");
  assert.equal(result.score, result.max);
  assert.ok(result.concepts.every((concept) => concept.status === "hit"));
});

test("a synonym paraphrase scores full marks", () => {
  const result = grade(
    "jpjc-p1-q1-ubiquitous",
    "Helicopter parents are widespread and have become an ordinary part of everyday life."
  );
  assert.equal(result.score, result.max);
});

test("partial answers award only the concepts present", () => {
  const result = grade("acjc-p1-q1", "Trust is the unseen foundation of society.");
  assert.equal(result.score, 1);
  assert.equal(result.max, 2);
  assert.equal(result.verdict, "partial");
  assert.equal(result.concepts[0].status, "hit");
  assert.equal(result.concepts[1].status, "miss");
});

test("a single typo is tolerated", () => {
  const result = grade(
    "acjc-p1-q5-asymmetry",
    "Trust is imballanced: hard to build but easy to destroy."
  );
  assert.equal(result.score, result.max);
});

test("unrelated answers score zero", () => {
  for (const [id, answer] of [
    ["ejc-p1-q3-pointless", "The work was boring and tiring."],
    ["acjc-p1-q5-asymmetry", "Trust is different for everyone."],
    ["ejc-p1-q2-favourites", "Life is unfair and random."],
    ["acjc-p1-q1", "Completely unrelated bananas."]
  ]) {
    const result = grade(id, answer);
    assert.equal(result.score, 0, `${id}: ${answer} -> ${result.score}/${result.max}`);
    assert.equal(result.verdict, "miss");
  }
});

test("negation does not earn the opposite concept", () => {
  const result = grade(
    "acjc-p1-q1",
    "Society is not advanced, and trust is not an unseen foundation."
  );
  assert.equal(result.concepts[0].matched, false);
  assert.equal(result.concepts[1].matched, false);
  assert.equal(result.score, 0);
});

test("do-not-accept distractors are vetoed", () => {
  const result = grade("acjc-p1-q1", "Trust is an educated and prosperous society.");
  const society = result.concepts.find((concept) => concept.id === "b");
  assert.equal(society.status, "forbidden");
  assert.equal(result.score, 0);

  const favourites = grade("ejc-p1-q2-favourites", "Life is fair and unbiased.");
  assert.equal(favourites.score, 0);
});

test("forbid matching stays strict and does not use synonyms", () => {
  const card = byId["cjc-p1-q4-surface"];
  const tokens = matcher.tokenize("The stakes seemed dangerous but there was a deeper purpose.");
  const exact = matcher.matchPhrase(tokens, "dangerous", { strict: true });
  assert.ok(exact);

  const synonymTokens = matcher.tokenize("The stakes seemed hazardous but there was a deeper purpose.");
  const loose = matcher.matchPhrase(synonymTokens, "dangerous", { strict: true });
  assert.equal(loose, null, "hazardous must not satisfy the strict forbid entry");
});

test("never-ending is an intensifier, not a negation", () => {
  const result = grade(
    "ejc-p1-q2-rat-race",
    "It describes an exhausting, never-ending competition to chase money and status."
  );
  assert.equal(result.score, result.max);
});

test("evidence names the phrase that earned the mark", () => {
  const result = grade("spec-p1-q3-swarming", "People working together like a colony of ants.");
  assert.equal(result.score, result.max);
  for (const concept of result.concepts) {
    assert.equal(concept.status, "hit");
    assert.ok(concept.evidence && concept.evidence.length > 0);
  }
});

test("borderline flags near misses for review", () => {
  const result = grade(
    "acjc-p1-q1",
    "Trust is the unseen foundation of a refined and advanced society."
  );
  assert.equal(result.score, result.max);
  assert.equal(result.borderline, false);
});

test("empty input never scores", () => {
  for (const answer of ["", "   ", "?!", null, undefined]) {
    const result = grade("acjc-p1-q1", answer);
    assert.equal(result.score, 0);
    assert.equal(result.wordCount, 0);
  }
});
