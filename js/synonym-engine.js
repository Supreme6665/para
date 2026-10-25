/*
 * PeridotSynonymEngine — prompt mining, synonym matching, and round scoring.
 *
 * The game deliberately sources prompt words from all passage contexts, not
 * from the card's question or target. Accepted synonyms come from the bundled
 * curated synonym groups. Closeness is a deterministic proxy: a synonym that
 * covers all of the source word's known meaning groups is strong, while one
 * that covers only some is close or loose.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./matcher.js"));
  } else {
    root.PeridotSynonymEngine = factory(root.PeridotMatcher);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (matcher) {
  "use strict";

  var TIERS = ["strong", "close", "loose"];
  var TIER_RANK = { strong: 3, close: 2, loose: 1 };
  var TIER_POINTS = { strong: 10, close: 6, loose: 3 };
  var MAX_STREAK_BONUS = 10;
  var MAX_WORDS = 3;
  var PROMPT_MIN_LENGTH = 4;
  var PROMPT_MAX_LENGTH = 20;

  function nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function canonicalTerm(value) {
    return matcher.normalize(value);
  }

  function termKey(value) {
    return matcher.tokenize(value)
      .map(function (token) { return matcher.stem(token); })
      .join(" ");
  }

  function uniquePush(list, value) {
    if (list.indexOf(value) === -1) list.push(value);
  }

  function shuffle(list, rng) {
    var out = list.slice();
    var random = rng || Math.random;
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function isStopword(word, stopwords) {
    return stopwords.has(word);
  }

  function isSentenceStart(text, index) {
    var before = text.slice(0, index).replace(/\s+$/, "");
    if (!before) return true;
    var last = before.slice(-1);
    return ".!?;:\"\u201c\u201d\u2018\u2019\u2014\u2013-".indexOf(last) !== -1;
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ---- index -------------------------------------------------------------

  function buildGroupIndex(groups) {
    var groupTerms = [];
    var termGroups = new Map();

    (groups || []).forEach(function (group, index) {
      var terms = [];
      (group || []).forEach(function (raw) {
        var term = canonicalTerm(raw);
        if (!term) return;
        uniquePush(terms, term);
        if (!termGroups.has(term)) termGroups.set(term, new Set());
        termGroups.get(term).add(index);
      });
      groupTerms.push(terms);
    });

    return {
      groupTerms: groupTerms,
      termGroups: termGroups
    };
  }

  function buildOccurrences(cards, stopwords, blocklist) {
    var occurrences = new Map();
    var blockedSeen = new Set();

    (cards || []).forEach(function (card) {
      var context = String(card.context || "");
      var re = /[A-Za-z]+/g;
      var match;
      while ((match = re.exec(context)) !== null) {
        var raw = match[0];
        var word = raw.toLowerCase();
        if (word.length < PROMPT_MIN_LENGTH || word.length > PROMPT_MAX_LENGTH) continue;
        if (isStopword(word, stopwords)) continue;
        if (blocklist.has(word)) {
          blockedSeen.add(word);
          continue;
        }

        var proper = raw[0] === raw[0].toUpperCase() &&
          raw[0] !== raw[0].toLowerCase() &&
          !isSentenceStart(context, match.index);

        var rec = occurrences.get(word);
        if (!rec) {
          rec = { word: word, count: 0, proper: 0, cardIds: [], papers: [] };
          occurrences.set(word, rec);
        }
        if (proper) {
          rec.proper += 1;
          continue;
        }
        rec.count += 1;
        uniquePush(rec.cardIds, card.id);
        uniquePush(rec.papers, card.paperShort || card.paper || "");
      }
    });

    return { occurrences: occurrences, blockedSeen: blockedSeen };
  }

  function chooseExample(word, cardIds, cardById) {
    var pattern = new RegExp("\\b" + escapeRegExp(word) + "\\b", "i");
    var best = null;
    var bestCard = null;

    (cardIds || []).forEach(function (cardId) {
      var card = cardById[cardId];
      if (!card) return;
      var context = String(card.context || "");
      var sentences = context.match(/[^.!?]+[.!?]+/g) || [context];
      sentences.forEach(function (sentence) {
        var text = sentence.trim();
        if (!pattern.test(text)) return;
        if (!best || text.length < best.length) {
          best = text;
          bestCard = card;
        }
      });
    });

    if (best && best.length > 260) {
      var at = best.toLowerCase().indexOf(word);
      var start = Math.max(0, at - 80);
      var end = Math.min(best.length, at + word.length + 120);
      best = (start > 0 ? "\u2026" : "") + best.slice(start, end).trim() +
        (end < best.length ? "\u2026" : "");
    }

    return { text: best || "", card: bestCard };
  }

  function tierForGroups(promptGroups, termGroups) {
    var shared = 0;
    promptGroups.forEach(function (group) {
      if (termGroups.has(group)) shared += 1;
    });
    var denom = Math.min(promptGroups.size, termGroups.size) || 1;
    var ratio = shared / denom;
    var tier = ratio >= 0.99 ? "strong" : ratio >= 0.5 ? "close" : "loose";
    return { tier: tier, ratio: ratio, shared: shared };
  }

  function overrideTierMap(overrides) {
    var map = new Map();
    ["loose", "close", "strong"].forEach(function (tier) {
      (overrides[tier] || []).forEach(function (term) {
        var key = canonicalTerm(term);
        if (key) map.set(key, tier);
      });
    });
    return map;
  }

  function acceptedFor(word, promptGroups, groupIndex, overrides, minSynonyms) {
    var promptKey = termKey(word);
    var rejectSet = new Set();
    (overrides.reject || []).forEach(function (term) {
      var key = termKey(term);
      if (key) rejectSet.add(key);
    });
    var explicitTiers = overrideTierMap(overrides);
    var byKey = new Map();

    function put(term, tier) {
      var key = termKey(term);
      if (!key || key === promptKey || rejectSet.has(key)) return;
      var existing = byKey.get(key);
      if (!existing || TIER_RANK[tier] > TIER_RANK[existing.tier]) {
        byKey.set(key, { term: term, tier: tier });
      }
    }

    promptGroups.forEach(function (group) {
      (groupIndex.groupTerms[group] || []).forEach(function (term) {
        var key = canonicalTerm(term);
        if (!key) return;
        if (explicitTiers.has(key)) {
          put(term, explicitTiers.get(key));
          return;
        }
        var termGroups = groupIndex.termGroups.get(key);
        if (!termGroups) return;
        put(term, tierForGroups(promptGroups, termGroups).tier);
      });
    });

    explicitTiers.forEach(function (tier, term) {
      put(term, tier);
    });

    var accepted = Array.from(byKey.values()).sort(function (a, b) {
      return TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.term.localeCompare(b.term);
    });

    if (accepted.length < minSynonyms) return null;

    var tiers = { strong: [], close: [], loose: [] };
    var matchEntries = [];
    accepted.forEach(function (entry) {
      tiers[entry.tier].push(entry.term);
      matchEntries.push({
        key: termKey(entry.term),
        term: entry.term,
        tier: entry.tier
      });
    });

    return {
      accepted: matchEntries,
      tiers: tiers,
      rejectKeys: Array.from(rejectSet)
    };
  }

  function buildIndex(options) {
    options = options || {};
    var cards = options.cards || [];
    var groups = options.groups || [];
    var config = options.config || {};
    var stopwords = options.stopwords || matcher.stopwords || new Set();
    var blocklist = new Set((config.blocklist || []).map(function (word) {
      return String(word).toLowerCase();
    }));
    var overrides = config.overrides || {};
    var minSynonyms = Number(config.minSynonyms) > 0 ? Number(config.minSynonyms) : 3;

    var cardById = {};
    cards.forEach(function (card) { cardById[card.id] = card; });

    var groupIndex = buildGroupIndex(groups);
    var occurrenceResult = buildOccurrences(cards, stopwords, blocklist);
    var occurrences = occurrenceResult.occurrences;

    var byStem = new Map();
    occurrences.forEach(function (rec) {
      if (!rec.count) return;
      if (!groupIndex.termGroups.has(rec.word)) return;
      var stem = matcher.stem(rec.word);
      if (!byStem.has(stem)) byStem.set(stem, []);
      byStem.get(stem).push(rec);
    });

    var prompts = [];
    var blocklisted = 0;

    byStem.forEach(function (records) {
      records.sort(function (a, b) {
        return b.count - a.count || b.cardIds.length - a.cardIds.length ||
          a.word.localeCompare(b.word);
      });

      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var promptGroups = groupIndex.termGroups.get(rec.word);
        if (!promptGroups || !promptGroups.size) continue;
        var built = acceptedFor(rec.word, promptGroups, groupIndex,
          overrides[rec.word] || {}, minSynonyms);
        if (!built) continue;
        if (!built.tiers.strong.length) continue;

        var cardsForWord = rec.cardIds.filter(function (id) { return !!cardById[id]; });
        if (!cardsForWord.length) continue;
        var papers = [];
        cardsForWord.forEach(function (id) {
          var paper = cardById[id].paperShort || cardById[id].paper || "";
          if (paper) uniquePush(papers, paper);
        });
        var example = chooseExample(rec.word, cardsForWord, cardById);

        prompts.push({
          id: rec.word,
          word: rec.word,
          promptKey: termKey(rec.word),
          accepted: built.accepted,
          tiers: built.tiers,
          rejectKeys: built.rejectKeys,
          source: {
            cards: cardsForWord,
            papers: papers,
            example: example.text,
            exampleCardId: example.card ? example.card.id : null
          }
        });
        break;
      }
    });

    prompts.sort(function (a, b) { return a.word.localeCompare(b.word); });

    var byWord = {};
    var allCards = {};
    var allPapers = {};
    prompts.forEach(function (prompt) {
      byWord[prompt.word] = prompt;
      prompt.source.cards.forEach(function (id) { allCards[id] = true; });
      prompt.source.papers.forEach(function (paper) { allPapers[paper] = true; });
    });
    blocklisted = occurrenceResult.blockedSeen.size;

    return {
      prompts: prompts,
      byWord: byWord,
      stats: {
        promptCount: prompts.length,
        cardCount: Object.keys(allCards).length,
        paperCount: Object.keys(allPapers).length,
        sourceCardCount: cards.length,
        blocklisted: blocklisted,
        groupCount: groups.length
      }
    };
  }

  // ---- rounds ------------------------------------------------------------

  function pointsFor(tier, streak) {
    var mult = TIER_POINTS[tier] || 0;
    var bonus = 1 + Math.min(streak || 0, MAX_STREAK_BONUS) * 0.1;
    return Math.round(mult * bonus);
  }

  function createRound(index, options) {
    options = options || {};
    if (!index || !index.prompts || !index.prompts.length) return null;
    var rng = options.rng || Math.random;
    var start = options.now == null ? nowMs() : options.now;
    var seconds = Number(options.roundSeconds) > 0 ? Number(options.roundSeconds) : 60;
    var durationMs = Math.round(seconds * 1000);
    var queue = shuffle(index.prompts, rng);

    if (options.previousWord && queue.length > 1 && queue[0].word === options.previousWord) {
      var tmp = queue[0];
      queue[0] = queue[1];
      queue[1] = tmp;
    }

    var round = {
      status: "playing",
      durationMs: durationMs,
      remainingMs: durationMs,
      deadline: start + durationMs,
      startedAt: start,
      endedAt: null,
      prompts: index.prompts,
      queue: queue,
      index: 0,
      wordNo: 1,
      current: queue[0],
      currentAnswers: [],
      currentKeys: new Set(),
      recorded: false,
      history: [],
      score: 0,
      streak: 0,
      bestStreak: 0,
      acceptedCount: 0,
      attemptCount: 0,
      duplicates: 0,
      summary: null,
      rng: rng
    };
    return round;
  }

  function recordCurrent(round) {
    if (round.recorded || !round.current) return;
    var found = round.currentAnswers.slice();
    var foundKeys = new Set(found.map(function (answer) { return answer.key; }));
    var missed = (round.current.tiers.strong || []).filter(function (term) {
      return !foundKeys.has(termKey(term));
    });
    round.history.push({
      word: round.current.word,
      source: round.current.source,
      found: found,
      missed: missed.slice(0, 5),
      missedCount: missed.length
    });
    round.recorded = true;
  }

  function summarize(round) {
    var tierCounts = { strong: 0, close: 0, loose: 0 };
    round.history.forEach(function (entry) {
      entry.found.forEach(function (answer) {
        if (tierCounts[answer.tier] !== undefined) tierCounts[answer.tier] += 1;
      });
    });
    return {
      score: round.score,
      bestStreak: round.bestStreak,
      acceptedCount: round.acceptedCount,
      attemptCount: round.attemptCount,
      duplicates: round.duplicates,
      accuracy: round.attemptCount ? round.acceptedCount / round.attemptCount : 0,
      wordsPlayed: round.history.length,
      tierCounts: tierCounts,
      history: round.history.slice(),
      durationMs: round.durationMs,
      startedAt: round.startedAt,
      endedAt: round.endedAt
    };
  }

  function finish(round, now) {
    if (!round) return null;
    if (round.status === "over" && round.summary) return round.summary;
    if (round.deadline != null) {
      round.remainingMs = Math.max(0, round.deadline - (now == null ? nowMs() : now));
    }
    recordCurrent(round);
    round.status = "over";
    round.deadline = null;
    round.endedAt = now == null ? nowMs() : now;
    round.summary = summarize(round);
    return round.summary;
  }

  function tick(round, now) {
    if (!round) return { remainingMs: 0, status: "over" };
    if (round.status === "playing") {
      round.remainingMs = Math.max(0, round.deadline - (now == null ? nowMs() : now));
      if (round.remainingMs <= 0) finish(round, now);
    }
    return {
      remainingMs: round.status === "over" ? 0 : round.remainingMs,
      status: round.status
    };
  }

  function pause(round, now) {
    if (!round || round.status !== "playing") return round;
    var at = now == null ? nowMs() : now;
    round.remainingMs = Math.max(0, round.deadline - at);
    if (round.remainingMs <= 0) {
      finish(round, at);
      return round;
    }
    round.status = "paused";
    round.deadline = null;
    return round;
  }

  function resume(round, now) {
    if (!round || round.status !== "paused") return round;
    var at = now == null ? nowMs() : now;
    if (round.remainingMs <= 0) {
      finish(round, at);
      return round;
    }
    round.status = "playing";
    round.deadline = at + round.remainingMs;
    return round;
  }

  function tokenClose(a, b) {
    if (a === b) return true;
    var minLen = Math.min(a.length, b.length);
    if (minLen < 5) return false;
    var limit = minLen >= 8 ? 2 : 1;
    return matcher.editDistance(a, b) <= limit;
  }

  function keysClose(inputKey, acceptedKey) {
    var input = inputKey.split(" ").filter(Boolean);
    var accepted = acceptedKey.split(" ").filter(Boolean);
    if (!input.length || input.length !== accepted.length) return false;
    for (var i = 0; i < input.length; i++) {
      if (!tokenClose(input[i], accepted[i])) return false;
    }
    return true;
  }

  function findMatch(prompt, inputKey) {
    var direct = null;
    for (var i = 0; i < prompt.accepted.length; i++) {
      if (prompt.accepted[i].key === inputKey) {
        direct = prompt.accepted[i];
        break;
      }
    }
    if (direct) return { entry: direct, typo: false };

    var best = null;
    var bestRank = -1;
    var bestDistance = Infinity;
    prompt.accepted.forEach(function (entry) {
      if (!keysClose(inputKey, entry.key)) return;
      var rank = TIER_RANK[entry.tier] || 0;
      var distance = matcher.editDistance(inputKey, entry.key);
      if (rank > bestRank || (rank === bestRank && distance < bestDistance)) {
        best = entry;
        bestRank = rank;
        bestDistance = distance;
      }
    });
    return best ? { entry: best, typo: true } : null;
  }

  function submit(round, text, now) {
    if (!round) return { status: "expired" };
    if (round.status === "playing") tick(round, now);
    if (round.status !== "playing") return { status: "expired" };

    var trimmed = String(text == null ? "" : text).trim();
    var inputKey = termKey(trimmed);
    if (!inputKey) return { status: "empty" };
    if (inputKey.split(" ").length > MAX_WORDS) {
      round.attemptCount += 1;
      round.streak = 0;
      return { status: "unrecognized", message: "Keep it to one to three words." };
    }
    if (round.currentKeys.has(inputKey) || round.current.promptKey === inputKey) {
      round.duplicates += 1;
      return { status: "duplicate", message: "Already found, or that is the original word." };
    }
    if (round.current.rejectKeys.indexOf(inputKey) !== -1) {
      round.attemptCount += 1;
      round.streak = 0;
      return { status: "rejected", message: "Not a synonym for this word." };
    }

    var match = findMatch(round.current, inputKey);
    if (!match) {
      round.attemptCount += 1;
      round.streak = 0;
      return { status: "unrecognized", message: "Not in the synonym bank — try another." };
    }
    if (round.currentKeys.has(match.entry.key)) {
      round.duplicates += 1;
      return { status: "duplicate", message: "Already found." };
    }

    var points = pointsFor(match.entry.tier, round.streak);
    var answer = {
      key: match.entry.key,
      term: match.entry.term,
      text: trimmed,
      tier: match.entry.tier,
      points: points,
      typo: match.typo
    };
    round.currentAnswers.push(answer);
    round.currentKeys.add(match.entry.key);
    round.currentKeys.add(inputKey);
    round.acceptedCount += 1;
    round.attemptCount += 1;
    round.streak += 1;
    round.bestStreak = Math.max(round.bestStreak, round.streak);
    round.score += points;

    return {
      status: "accepted",
      tier: match.entry.tier,
      points: points,
      term: match.entry.term,
      typo: match.typo,
      message: (match.typo ? "Accepted with a spelling correction. " : "") +
        "+" + points + " · " + match.entry.tier
    };
  }

  function nextPrompt(round) {
    if (!round || round.status !== "playing") return null;
    recordCurrent(round);
    if (!round.currentAnswers.length) round.streak = 0;

    round.index += 1;
    if (round.index >= round.queue.length) {
      var oldWord = round.current ? round.current.word : null;
      round.queue = shuffle(round.prompts, round.rng);
      round.index = 0;
      if (oldWord && round.queue.length > 1 && round.queue[0].word === oldWord) {
        var tmp = round.queue[0];
        round.queue[0] = round.queue[1];
        round.queue[1] = tmp;
      }
    }

    round.current = round.queue[round.index];
    round.currentAnswers = [];
    round.currentKeys = new Set();
    round.recorded = false;
    round.wordNo += 1;
    return round.current;
  }

  function strongRemaining(round) {
    if (!round || !round.current) return 0;
    var found = new Set(round.currentAnswers.map(function (answer) { return answer.key; }));
    return (round.current.tiers.strong || []).filter(function (term) {
      return !found.has(termKey(term));
    }).length;
  }

  function formatTime(ms) {
    var seconds = Math.max(0, Math.ceil((ms || 0) / 1000));
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
  }

  return {
    buildIndex: buildIndex,
    createRound: createRound,
    submit: submit,
    nextPrompt: nextPrompt,
    tick: tick,
    pause: pause,
    resume: resume,
    finish: finish,
    pointsFor: pointsFor,
    strongRemaining: strongRemaining,
    formatTime: formatTime,
    termKey: termKey,
    canonicalTerm: canonicalTerm,
    nowMs: nowMs,
    TIERS: TIERS,
    TIER_RANK: TIER_RANK,
    TIER_POINTS: TIER_POINTS
  };
});
