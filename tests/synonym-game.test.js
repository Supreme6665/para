"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const cardsJson = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "cards.json"), "utf8"));
const synonymsJson = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "synonyms.json"), "utf8"));
const gameConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "synonym-game.json"), "utf8"));

const matcherApi = require(path.join(ROOT, "js", "matcher.js"));
const engine = require(path.join(ROOT, "js", "synonym-engine.js"));

const matcher = matcherApi.createMatcher({ synonymGroups: synonymsJson.groups });
const stopwords = matcherApi.stopwords;
const cards = cardsJson.cards;
const index = engine.buildIndex({
  cards,
  groups: synonymsJson.groups,
  config: gameConfig
});

function prompt(word) {
  const found = index.byWord[word];
  assert.ok(found, `expected prompt ${JSON.stringify(word)} in the index`);
  return found;
}

function roundWith(word, now) {
  const round = engine.createRound(index, {
    roundSeconds: 60,
    now: now == null ? 0 : now,
    rng: () => 0.25
  });
  assert.ok(round, "round should start");
  round.current = prompt(word);
  round.currentAnswers = [];
  round.currentKeys = new Set();
  round.recorded = false;
  round.wordNo = 1;
  return round;
}

test("prompt index covers every card and paper", () => {
  const papers = new Set(cards.map((card) => card.paperShort || card.paper));
  assert.ok(index.prompts.length >= 300, `expected a deep prompt pool, got ${index.prompts.length}`);
  assert.equal(index.stats.promptCount, index.prompts.length);
  assert.equal(index.stats.sourceCardCount, cards.length);
  assert.equal(index.stats.cardCount, cards.length);
  assert.equal(index.stats.paperCount, papers.size);
  assert.ok(index.stats.blocklisted > 0);
});

test("every prompt has strong synonyms and a real passage source", () => {
  const seen = new Set();
  const contextBlob = cards.map((card) => String(card.context || "")).join("\n").toLowerCase();
  for (const item of index.prompts) {
    assert.ok(item.accepted.length >= gameConfig.minSynonyms,
      `${item.word}: too few accepted synonyms`);
    assert.ok(item.tiers.strong.length >= 1, `${item.word}: no strong synonym`);
    assert.ok(item.source.cards.length >= 1, `${item.word}: no source cards`);
    assert.ok(item.source.papers.length >= 1, `${item.word}: no source papers`);
    assert.ok(item.source.example, `${item.word}: no example sentence`);
    assert.match(item.source.example.toLowerCase(), new RegExp("\\b" + item.word + "\\b"),
      `${item.word}: example does not contain the word`);
    assert.ok(contextBlob.includes(item.word), `${item.word}: not mined from a passage`);
    assert.ok(!stopwords.has(item.word), `${item.word}: stopword leaked in`);
    assert.ok(!gameConfig.blocklist.includes(item.word), `${item.word}: blocklisted word leaked in`);

    const stem = matcher.stem(item.word);
    assert.ok(!seen.has(stem), `${item.word}: duplicate prompt stem ${stem}`);
    seen.add(stem);

    const keys = item.accepted.map((entry) => entry.key);
    assert.equal(new Set(keys).size, keys.length, `${item.word}: duplicate accepted synonyms`);
    for (const entry of item.accepted) {
      assert.ok(["strong", "close", "loose"].includes(entry.tier), `${item.word}: bad tier`);
      assert.ok(entry.term && entry.key, `${item.word}: empty synonym entry`);
    }
  }
});

test("tier overrides move broad synonyms to close or loose", () => {
  const important = prompt("important");
  assert.ok(important.tiers.strong.includes("crucial"));
  assert.ok(important.tiers.close.includes("substantial"));
  assert.ok(important.tiers.loose.includes("central"));
  assert.ok(!important.tiers.strong.includes("central"));

  const publicWord = prompt("public");
  assert.ok(publicWord.tiers.close.includes("common"));
  assert.ok(publicWord.tiers.loose.includes("population"));
});

test("scoring grows with tier and caps the streak multiplier", () => {
  assert.equal(engine.pointsFor("strong", 0), 10);
  assert.equal(engine.pointsFor("close", 0), 6);
  assert.equal(engine.pointsFor("loose", 0), 3);
  assert.equal(engine.pointsFor("strong", 1), 11);
  assert.equal(engine.pointsFor("strong", 9), 19);
  assert.equal(engine.pointsFor("strong", 10), 20);
  assert.equal(engine.pointsFor("strong", 100), 20);
});

test("accepted synonyms score, duplicates preserve the streak, misses reset it", () => {
  const round = roundWith("abandon");
  const strong = round.current.tiers.strong;

  const first = engine.submit(round, strong[0], 1000);
  assert.equal(first.status, "accepted");
  assert.equal(first.tier, "strong");
  assert.equal(first.points, 10);
  assert.equal(round.score, 10);
  assert.equal(round.streak, 1);

  const duplicate = engine.submit(round, strong[0], 2000);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(round.score, 10);
  assert.equal(round.streak, 1);
  assert.equal(round.duplicates, 1);

  const second = engine.submit(round, strong[1], 3000);
  assert.equal(second.status, "accepted");
  assert.equal(second.points, 11, "streak multiplier should raise the next score");
  assert.equal(round.score, 21);
  assert.equal(round.bestStreak, 2);

  const miss = engine.submit(round, "zzzznotaword", 4000);
  assert.equal(miss.status, "unrecognized");
  assert.equal(round.streak, 0);
  assert.equal(round.score, 21);
  assert.equal(round.attemptCount, 3);
});

test("one-character typos are accepted with a correction notice", () => {
  const round = roundWith("important");
  assert.ok(prompt("important").tiers.strong.includes("fundamental"));
  const result = engine.submit(round, "fundamentl", 1000);
  assert.equal(result.status, "accepted");
  assert.equal(result.term, "fundamental");
  assert.equal(result.typo, true);
  assert.ok(result.message.includes("spelling correction"));
});

test("explicit reject lists veto misleading answers", () => {
  const up = roundWith("rise");
  const upResult = engine.submit(up, "fall", 1000);
  assert.equal(upResult.status, "rejected");
  assert.equal(up.score, 0);

  const down = roundWith("decline");
  const downResult = engine.submit(down, "increase", 1000);
  assert.equal(downResult.status, "rejected");
  assert.equal(down.score, 0);
});

test("moving to the next word records history and clears the current answer set", () => {
  const round = roundWith("abandon");
  const answer = round.current.tiers.strong[0];
  const expectedTop = round.current.accepted.slice(0, 3).map((entry) => entry.term);
  engine.submit(round, answer, 1000);
  const next = engine.nextPrompt(round);
  assert.ok(next);
  assert.equal(round.history.length, 1);
  assert.equal(round.history[0].word, "abandon");
  assert.equal(round.history[0].found[0].term, answer);
  assert.ok(round.history[0].missed.length > 0);
  assert.deepEqual(round.history[0].top.map((entry) => entry.term), expectedTop);
  assert.equal(round.currentAnswers.length, 0);
  assert.equal(round.wordNo, 2);
  assert.equal(round.score, 10);
});

test("review queue keeps only words with no accepted synonyms, once each", () => {
  const top = [
    { term: "desert", tier: "strong" },
    { term: "forsake", tier: "strong" },
    { term: "leave", tier: "close" }
  ];
  const summary = {
    history: [
      { word: "abandon", found: [], top },
      { word: "abandon", found: [], top },
      { word: "important", found: [{ term: "crucial" }], top: [] },
      { word: "rise", found: [], top: [{ term: "climb", tier: "strong" }] },
      { word: "cut", found: [] }
    ]
  };

  const queue = engine.reviewQueue(summary);
  assert.deepEqual(queue.map((item) => item.word), ["abandon", "rise", "cut"]);
  assert.deepEqual(queue[0].top, top);
  assert.equal(queue[1].top.length, 1);
  assert.deepEqual(queue[2].top, []);

  assert.deepEqual(engine.reviewQueue(summary, 1).map((item) => item.word), ["abandon"]);
  assert.deepEqual(engine.reviewQueue(summary, 0), []);
});

test("an unanswered final word joins the review queue after finishing", () => {
  const round = roundWith("abandon", 0);
  engine.submit(round, round.current.tiers.strong[0], 1000);
  engine.nextPrompt(round);
  round.current = prompt("important");
  round.currentAnswers = [];
  round.currentKeys = new Set();
  round.recorded = false;

  const summary = engine.finish(round, 20000);
  const queue = engine.reviewQueue(summary);
  assert.deepEqual(queue.map((item) => item.word), ["important"]);
  assert.equal(queue[0].top.length, 3);
  assert.ok(queue[0].top[0].term);
});

test("pause freezes the clock and resume restores the remaining time", () => {
  const round = engine.createRound(index, { roundSeconds: 60, now: 0, rng: () => 0.5 });

  assert.equal(engine.tick(round, 14000).remainingMs, 46000);
  engine.pause(round, 20000);
  assert.equal(round.status, "paused");
  assert.equal(round.remainingMs, 40000);
  assert.equal(engine.tick(round, 25000).remainingMs, 40000);

  engine.resume(round, 50000);
  assert.equal(round.status, "playing");
  assert.equal(engine.tick(round, 89000).remainingMs, 1000);
  const expired = engine.tick(round, 90000);
  assert.equal(expired.status, "over");
  assert.equal(expired.remainingMs, 0);
  assert.ok(round.summary);
  assert.equal(round.summary.durationMs, 60000);
});

test("finishing a round produces one stable summary", () => {
  const round = roundWith("abandon", 0);
  const result = engine.submit(round, round.current.tiers.strong[0], 1000);
  assert.equal(result.status, "accepted");

  const summary = engine.finish(round, 30000);
  assert.equal(summary.score, 10);
  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.attemptCount, 1);
  assert.equal(summary.accuracy, 1);
  assert.equal(summary.wordsPlayed, 1);
  assert.equal(summary.tierCounts.strong, 1);
  assert.equal(summary.history[0].word, "abandon");
  assert.equal(engine.finish(round, 40000), summary);
});

test("clock formatting rounds up and never goes negative", () => {
  assert.equal(engine.formatTime(60000), "1:00");
  assert.equal(engine.formatTime(59001), "1:00");
  assert.equal(engine.formatTime(9000), "0:09");
  assert.equal(engine.formatTime(0), "0:00");
  assert.equal(engine.formatTime(-500), "0:00");
});
