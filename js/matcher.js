/*
 * PeridotMatcher — offline concept-based paraphrase scoring.
 *
 * A card contains mark-scheme "concepts". Each concept has a list of
 * acceptable paraphrases. The matcher normalises the learner's answer,
 * stems it, expands it with a bundled synonym map, and checks which
 * concepts were captured. It is deliberately explainable: every mark
 * comes with the phrase that earned it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PeridotMatcher = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONTRACTIONS = {
    "doesn't": "does not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "don't": "do not",
    "didn't": "did not",
    "can't": "cannot",
    "couldn't": "could not",
    "won't": "will not",
    "wouldn't": "would not",
    "shouldn't": "should not",
    "mustn't": "must not",
    "haven't": "have not",
    "hasn't": "has not",
    "hadn't": "had not",
    "it's": "it is",
    "that's": "that is",
    "there's": "there is",
    "they're": "they are",
    "we're": "we are",
    "you're": "you are",
    "i'm": "i am"
  };

  var STOP = new Set(
    ("a an the of to in on for with and or but as at by from that this these those " +
      "it its is are was were be been being has have had do does did can could will " +
      "would shall should may might must their his her our your my them they he she " +
      "we you i me him us who which what when where why how there here also very just " +
      "so such than then into over under about more most some any each other another " +
      "own only too up down out off again further once both").split(" ")
  );

  var NEGATORS = new Set(["not", "no", "never", "cannot", "hardly", "without", "lack", "lacks", "lacking", "none", "neither", "nor"]);

  // ---- normalisation -----------------------------------------------------

  function normalize(input) {
    var s = String(input == null ? "" : input);
    s = s.replace(/[\u2018\u2019\u201a\u201b\u2032\u0060]/g, "'");
    s = s.replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"');
    s = s.replace(/[\u2013\u2014\u2212]/g, " ");
    s = s.toLowerCase();
    // "never-ending" is an intensifier, not a negator; keep the negation
    // guard from treating it as one.
    s = s.replace(/\bnever[\s-]+ending\b/g, "endless");
    for (var key in CONTRACTIONS) {
      if (Object.prototype.hasOwnProperty.call(CONTRACTIONS, key)) {
        s = s.split(key).join(CONTRACTIONS[key]);
      }
    }
    s = s.normalize ? s.normalize("NFKC") : s;
    s = s.replace(/[^a-z0-9\s]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function tokenize(text) {
    var n = normalize(text);
    return n ? n.split(" ").filter(Boolean) : [];
  }

  // ---- Porter stemmer (compact) -----------------------------------------

  function isConsonant(word, i) {
    var c = word[i];
    if (c === undefined) return false;
    if ("aeiou".indexOf(c) !== -1) return false;
    if (c === "y") return i === 0 ? true : !isConsonant(word, i - 1);
    return true;
  }

  function measure(word) {
    var m = 0;
    var i = 0;
    var n = word.length;
    while (i < n && isConsonant(word, i)) i++;
    while (i < n) {
      while (i < n && !isConsonant(word, i)) i++;
      if (i >= n) break;
      m++;
      while (i < n && isConsonant(word, i)) i++;
    }
    return m;
  }

  function hasVowel(word) {
    for (var i = 0; i < word.length; i++) {
      if (!isConsonant(word, i)) return true;
    }
    return false;
  }

  function cvc(word) {
    if (word.length < 3) return false;
    var n = word.length;
    return (
      isConsonant(word, n - 3) &&
      !isConsonant(word, n - 2) &&
      isConsonant(word, n - 1) &&
      "wxy".indexOf(word[n - 1]) === -1
    );
  }

  var STEP2 = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
    ["izer", "ize"], ["bli", "ble"], ["alli", "al"], ["entli", "ent"],
    ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"],
    ["ousness", "ous"], ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"],
    ["logi", "log"]
  ];

  var STEP3 = [
    ["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"],
    ["ical", "ic"], ["ful", ""], ["ness", ""]
  ];

  var STEP4 = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
    "ment", "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize"
  ];

  var stemCache = new Map();

  function stem(word) {
    if (stemCache.has(word)) return stemCache.get(word);
    var result = porter(word);
    stemCache.set(word, result);
    return result;
  }

  function porter(w) {
    if (w.length < 3) return w;
    var s = w;

    // Step 1a
    if (s.endsWith("sses")) s = s.slice(0, -2);
    else if (s.endsWith("ies")) s = s.slice(0, -2);
    else if (s.endsWith("ss")) {
      /* keep */
    } else if (s.endsWith("s")) s = s.slice(0, -1);

    // Step 1b
    var changed = false;
    if (s.endsWith("eed")) {
      var baseEed = s.slice(0, -3);
      if (measure(baseEed) > 0) s = baseEed + "ee";
    } else if (s.endsWith("ed")) {
      var baseEd = s.slice(0, -2);
      if (hasVowel(baseEd)) {
        s = baseEd;
        changed = true;
      }
    } else if (s.endsWith("ing")) {
      var baseIng = s.slice(0, -3);
      if (hasVowel(baseIng)) {
        s = baseIng;
        changed = true;
      }
    }
    if (changed) {
      if (s.endsWith("at") || s.endsWith("bl") || s.endsWith("iz")) s += "e";
      else if (/(bb|dd|ff|gg|mm|nn|pp|rr|tt)$/.test(s)) s = s.slice(0, -1);
      else if (measure(s) === 1 && cvc(s)) s += "e";
    }

    // Step 1c
    if (s.endsWith("y")) {
      var baseY = s.slice(0, -1);
      if (hasVowel(baseY)) s = baseY + "i";
    }

    // Step 2
    for (var i = 0; i < STEP2.length; i++) {
      var suf2 = STEP2[i][0];
      if (s.endsWith(suf2)) {
        var base2 = s.slice(0, -suf2.length);
        if (measure(base2) > 0) s = base2 + STEP2[i][1];
        break;
      }
    }

    // Step 3
    for (var j = 0; j < STEP3.length; j++) {
      var suf3 = STEP3[j][0];
      if (s.endsWith(suf3)) {
        var base3 = s.slice(0, -suf3.length);
        if (measure(base3) > 0) s = base3 + STEP3[j][1];
        break;
      }
    }

    // Step 4
    for (var k = 0; k < STEP4.length; k++) {
      var suf4 = STEP4[k];
      if (s.endsWith(suf4)) {
        var base4 = s.slice(0, -suf4.length);
        if (suf4 === "ion" && !/[st]$/.test(base4)) break;
        if (measure(base4) > 1) s = base4;
        break;
      }
    }

    // Step 5a
    if (s.endsWith("e")) {
      var base5 = s.slice(0, -1);
      var m5 = measure(base5);
      if (m5 > 1 || (m5 === 1 && !cvc(base5))) s = base5;
    }

    // Step 5b
    if (s.endsWith("ll") && measure(s) > 1) s = s.slice(0, -1);

    return s;
  }

  // ---- fuzzy matching ----------------------------------------------------

  function damerau(a, b) {
    var al = a.length;
    var bl = b.length;
    if (Math.abs(al - bl) > 2) return 99;
    var d = [];
    for (var i = 0; i <= al; i++) {
      d[i] = [i];
    }
    for (var j = 0; j <= bl; j++) d[0][j] = j;
    for (var x = 1; x <= al; x++) {
      for (var y = 1; y <= bl; y++) {
        var cost = a[x - 1] === b[y - 1] ? 0 : 1;
        d[x][y] = Math.min(d[x - 1][y] + 1, d[x][y - 1] + 1, d[x - 1][y - 1] + cost);
        if (x > 1 && y > 1 && a[x - 1] === b[y - 2] && a[x - 2] === b[y - 1]) {
          d[x][y] = Math.min(d[x][y], d[x - 2][y - 2] + 1);
        }
      }
    }
    return d[al][bl];
  }

  // ---- matcher factory ---------------------------------------------------

  function createMatcher(options) {
    options = options || {};
    var groups = options.synonymGroups || [];
    var synMap = new Map();

    groups.forEach(function (group, idx) {
      group.forEach(function (raw) {
        if (!/^[a-z]+$/i.test(raw)) return;
        var key = stem(raw.toLowerCase());
        if (!synMap.has(key)) synMap.set(key, new Set());
        synMap.get(key).add(idx);
      });
    });

    function synonymMatch(a, b) {
      var ga = synMap.get(a);
      var gb = synMap.get(b);
      if (!ga || !gb) return false;
      for (var g of ga) {
        if (gb.has(g)) return true;
      }
      return false;
    }

    function tokensMatch(a, b) {
      if (a === b) return true;
      var sa = stem(a);
      var sb = stem(b);
      if (sa === sb) return true;
      if (synonymMatch(sa, sb)) return true;
      var minLen = Math.min(a.length, b.length);
      if (minLen >= 5) {
        var limit = minLen >= 8 ? 2 : 1;
        if (damerau(a, b) <= limit) return true;
      }
      return false;
    }

    function findSequence(hay, needle) {
      if (!needle.length || needle.length > hay.length) return -1;
      outer: for (var i = 0; i + needle.length <= hay.length; i++) {
        for (var j = 0; j < needle.length; j++) {
          if (hay[i + j] !== needle[j]) continue outer;
        }
        return i;
      }
      return -1;
    }

    function tokensMatchStrict(a, b) {
      return a === b || stem(a) === stem(b);
    }

    function findToken(tokens, target, strict) {
      for (var i = 0; i < tokens.length; i++) {
        var hit = strict ? tokensMatchStrict(tokens[i], target) : tokensMatch(tokens[i], target);
        if (hit) return { index: i, token: tokens[i] };
      }
      return null;
    }

    function isNegated(tokens, index) {
      var start = Math.max(0, index - 3);
      for (var i = start; i < index; i++) {
        if (NEGATORS.has(tokens[i])) return true;
      }
      return false;
    }

    function hasNegator(tokens) {
      return tokens.some(function (t) {
        return NEGATORS.has(t);
      });
    }

    function matchPhrase(inputTokens, phrase, opts) {
      opts = opts || {};
      var strict = !!opts.strict;
      var p = tokenize(phrase);
      if (!p.length) return null;

      var exactAt = findSequence(inputTokens, p);
      if (exactAt !== -1) {
        // Even an exact phrase is wrong when the writer has negated it:
        // "not an unseen foundation" must not earn "unseen foundation".
        var exactNegated = false;
        if (!hasNegator(p)) {
          for (var q = 0; q < p.length; q++) {
            if (isNegated(inputTokens, exactAt + q)) {
              exactNegated = true;
              break;
            }
          }
        }
        if (exactNegated) {
          return {
            confidence: 0.2,
            evidence: phrase,
            exact: true,
            firstIndex: exactAt,
            coverage: 1,
            negated: true
          };
        }
        return {
          confidence: 1,
          evidence: phrase,
          exact: true,
          firstIndex: exactAt,
          coverage: 1
        };
      }

      if (strict) return null;

      var content = p.filter(function (t) {
        return !STOP.has(t);
      });
      var use = content.length ? content : p;
      var hits = [];
      var seen = new Set();
      for (var i = 0; i < use.length; i++) {
        var hit = findToken(inputTokens, use[i], false);
        if (hit && !seen.has(hit.index)) {
          hits.push(hit);
          seen.add(hit.index);
        }
      }

      var coverage = use.length ? hits.length / use.length : 0;
      var confidence = 0;
      if (use.length === 1) {
        confidence = hits.length ? 0.9 : 0;
      } else if (coverage >= 0.999) {
        confidence = 0.95;
      } else if (coverage >= 0.72) {
        confidence = 0.82;
      } else if (coverage >= 0.6) {
        confidence = 0.6;
      }

      if (!confidence || !hits.length) return null;

      // Negation guard: "not easy" must not match the accept phrase "easy".
      var acceptHasNeg = hasNegator(use);
      if (!acceptHasNeg) {
        var negated = hits.some(function (h) {
          return isNegated(inputTokens, h.index);
        });
        if (negated) {
          return {
            confidence: 0.2,
            evidence: phrase,
            exact: false,
            firstIndex: hits[0].index,
            coverage: coverage,
            negated: true
          };
        }
      }

      // An anchor word keeps function words from earning a mark.
      var anchor = hits.some(function (h) {
        return h.token.length >= 4 || /^[0-9]+$/.test(h.token);
      });
      if (!anchor) return null;

      return {
        confidence: confidence,
        evidence: phrase,
        exact: false,
        firstIndex: hits[0].index,
        coverage: coverage
      };
    }

    function matchConcept(concept, inputTokens) {
      var best = {
        id: concept.id,
        label: concept.label,
        weight: concept.weight,
        matched: false,
        confidence: 0,
        evidence: null,
        status: "miss"
      };

      (concept.accept || []).forEach(function (phrase) {
        var r = matchPhrase(inputTokens, phrase);
        if (r && r.confidence > best.confidence) {
          best.confidence = r.confidence;
          best.evidence = r.evidence;
          best.exact = r.exact;
          best.negated = !!r.negated;
        }
      });

      var forbidden = false;
      (concept.forbid || []).forEach(function (phrase) {
        var r = matchPhrase(inputTokens, phrase, { strict: true });
        if (r && r.confidence >= 0.8 && !r.negated) forbidden = true;
      });

      if (forbidden) {
        best.matched = false;
        best.confidence = 0;
        best.status = "forbidden";
        best.evidence = null;
        return best;
      }

      if (best.confidence >= 0.68) {
        best.matched = true;
        best.status = "hit";
      } else if (best.confidence >= 0.5) {
        best.matched = false;
        best.status = "near";
      } else {
        best.matched = false;
        best.status = "miss";
        best.evidence = null;
        best.confidence = 0;
      }
      return best;
    }

    function grade(card, answer) {
      var norm = normalize(answer);
      var tokens = tokenize(norm);
      var concepts = (card.concepts || []).map(function (c) {
        return matchConcept(c, tokens);
      });
      var raw = concepts.reduce(function (sum, c) {
        return sum + (c.matched ? c.weight : 0);
      }, 0);
      var score = Math.min(card.marks, raw);
      var verdict = score >= card.marks ? "correct" : score > 0 ? "partial" : "miss";
      var borderline = concepts.some(function (c) {
        return c.status === "near";
      }) || (verdict === "partial" && concepts.some(function (c) { return c.matched; }));

      return {
        score: score,
        max: card.marks,
        verdict: verdict,
        borderline: borderline,
        concepts: concepts,
        wordCount: tokens.length,
        normalized: norm
      };
    }

    function wouldMatch(card, phrase) {
      // Used by the dataset validator: does an accept phrase match itself?
      return grade(card, phrase);
    }

    return {
      grade: grade,
      normalize: normalize,
      tokenize: tokenize,
      stem: stem,
      matchPhrase: matchPhrase,
      wouldMatch: wouldMatch
    };
  }

  return {
    createMatcher: createMatcher,
    normalize: normalize,
    tokenize: tokenize,
    stem: stem,
    stopwords: STOP,
    editDistance: damerau
  };
});
