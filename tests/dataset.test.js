"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const cardsJson = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "cards.json"), "utf8"));
const synonymsJson = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "synonyms.json"), "utf8"));
const gameJson = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "synonym-game.json"), "utf8"));

global.window = {};
require(path.join(ROOT, "js", "synonyms.js"));
require(path.join(ROOT, "js", "data.js"));
require(path.join(ROOT, "js", "synonym-game.js"));
const { createMatcher } = require(path.join(ROOT, "js", "matcher.js"));

const matcher = createMatcher({ synonymGroups: synonymsJson.groups });
const cards = cardsJson.cards;
const byId = Object.fromEntries(cards.map((card) => [card.id, card]));

const TYPES = new Set(["vocab", "literal", "figurative", "language", "term"]);
const ORIGINS = new Set(["exam", "adapted", "created"]);

test("dataset has a usable size and spread", () => {
  assert.ok(cards.length >= 100, `expected at least 100 cards, got ${cards.length}`);
  const papers = new Set(cards.map((card) => card.paper));
  assert.ok(papers.size >= 12, `expected at least 12 papers, got ${papers.size}`);
  const usedTypes = new Set(cards.map((card) => card.questionType));
  assert.ok(usedTypes.size >= 3, `expected a spread of question types, got ${usedTypes.size}`);
  for (const type of usedTypes) {
    assert.ok(TYPES.has(type), `unknown question type ${type}`);
  }
});

test("card ids are unique", () => {
  const ids = cards.map((card) => card.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every card has the required shape", () => {
  for (const card of cards) {
    for (const key of ["id", "word", "paper", "paperShort", "question", "context", "sentence", "target", "note"]) {
      assert.equal(typeof card[key], "string", `${card.id}: ${key} should be a string`);
      assert.ok(card[key].trim().length > 0, `${card.id}: ${key} is empty`);
    }
    assert.ok(Number.isInteger(card.passage), `${card.id}: passage should be an integer`);
    assert.ok(Number.isInteger(card.marks), `${card.id}: marks should be an integer`);
    assert.ok(card.marks >= 1 && card.marks <= 4, `${card.id}: marks out of range`);
    assert.ok(TYPES.has(card.questionType), `${card.id}: bad question type`);
    assert.ok(ORIGINS.has(card.origin), `${card.id}: bad origin`);
    assert.ok(card.context.includes(card.sentence), `${card.id}: sentence is not in context`);
    assert.ok(Array.isArray(card.modelAnswers) && card.modelAnswers.length > 0, `${card.id}: no model answers`);
    assert.ok(Array.isArray(card.concepts) && card.concepts.length > 0, `${card.id}: no concepts`);
  }
});

test("each target occurs exactly once in its sentence", () => {
  for (const card of cards) {
    const occurrences = card.sentence.split(card.target).length - 1;
    assert.equal(occurrences, 1, `${card.id}: target ${JSON.stringify(card.target)} occurs ${occurrences} times`);
  }
});

test("concept weights add up to the marks", () => {
  for (const card of cards) {
    const total = card.concepts.reduce((sum, concept) => sum + concept.weight, 0);
    assert.equal(total, card.marks, `${card.id}: weights ${total} vs marks ${card.marks}`);
    for (const concept of card.concepts) {
      assert.ok(concept.id, `${card.id}: concept without id`);
      assert.ok(concept.label, `${card.id}/${concept.id}: no label`);
      assert.ok(Number.isInteger(concept.weight) && concept.weight >= 1, `${card.id}/${concept.id}: bad weight`);
      assert.ok(Array.isArray(concept.accept) && concept.accept.length > 0, `${card.id}/${concept.id}: no accepts`);
    }
  }
});

test("every model answer earns full marks", () => {
  const failures = [];
  for (const card of cards) {
    for (const answer of card.modelAnswers) {
      const result = matcher.grade(card, answer);
      if (result.score < result.max) {
        failures.push(
          `${card.id}: ${result.score}/${result.max} for ${JSON.stringify(answer)} ` +
          `(missed: ${result.concepts.filter((c) => !c.matched).map((c) => c.label).join(", ")})`
        );
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("every accepted phrase matches its own concept", () => {
  const failures = [];
  for (const card of cards) {
    for (const concept of card.concepts) {
      for (const phrase of concept.accept) {
        const result = matcher.grade(card, phrase);
        const scored = result.concepts.find((c) => c.id === concept.id);
        if (!scored || !scored.matched) {
          failures.push(`${card.id}/${concept.id}: ${JSON.stringify(phrase)} -> ${scored ? scored.status : "missing"}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("accept phrases do not accidentally trigger their own forbid list", () => {
  const failures = [];
  for (const card of cards) {
    for (const concept of card.concepts) {
      if (!concept.forbid) continue;
      for (const phrase of concept.accept) {
        const result = matcher.grade(card, phrase);
        const scored = result.concepts.find((c) => c.id === concept.id);
        if (scored && scored.status === "forbidden") {
          failures.push(`${card.id}/${concept.id}: ${JSON.stringify(phrase)} is vetoed by forbid`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("generated browser data is in sync with the JSON sources", () => {
  assert.deepEqual(window.PERIDOT_DATA.cards, cards);
  assert.deepEqual(window.PERIDOT_SYNONYMS.groups, synonymsJson.groups);
  assert.deepEqual(window.PERIDOT_SYNONYM_GAME, gameJson);
});

test("synonym groups are well formed", () => {
  assert.ok(synonymsJson.groups.length >= 200);
  for (const group of synonymsJson.groups) {
    assert.ok(Array.isArray(group) && group.length >= 2, "group should have at least two terms");
    for (const term of group) {
      assert.equal(typeof term, "string");
      assert.ok(term.trim().length > 0);
      assert.ok(/^[a-z][a-z\s-]*$/i.test(term), `unexpected synonym entry ${JSON.stringify(term)}`);
    }
  }
});
