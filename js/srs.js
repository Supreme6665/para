/* Leitner-style scheduling and session queue helpers. */
(function (root) {
  "use strict";

  var INTERVALS = [0, 1, 3, 7, 16];

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDays(iso, days) {
    var parts = iso.split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function isDue(record, today) {
    if (!record) return true;
    return !record.due || record.due <= (today || todayISO());
  }

  function review(previous, result, today) {
    var prev = previous || { attempts: 0, correct: 0, box: 0 };
    var correct = result.score >= result.max;
    var partial = result.score > 0 && !correct;
    var box = prev.box || 0;
    if (correct) box = Math.min(INTERVALS.length - 1, box + 1);
    else if (!partial) box = 0;

    return {
      attempts: (prev.attempts || 0) + 1,
      correct: (prev.correct || 0) + (correct ? 1 : 0),
      box: box,
      due: addDays(today || todayISO(), INTERVALS[box]),
      lastScore: result.score,
      lastMax: result.max,
      lastSeen: today || todayISO(),
      lastVerdict: result.verdict
    };
  }

  function shuffle(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function matchesFilters(card, settings) {
    var papers = settings.papers || [];
    var types = settings.types || [];
    if (papers.length && papers.indexOf(card.paper) === -1) return false;
    if (types.length && types.indexOf(card.questionType) === -1) return false;
    return true;
  }

  function buildQueue(cards, settings, progress, today) {
    var mode = settings.mode || "practice";
    var pool = cards.filter(function (card) {
      return matchesFilters(card, settings);
    });

    var notice = "";

    if (mode === "due") {
      var due = pool.filter(function (card) {
        return isDue(progress[card.id], today);
      });
      if (due.length) {
        pool = due;
      } else {
        notice = "No cards are due yet, so this session uses the whole selection.";
      }
    }

    if (mode === "weak") {
      var weak = pool.filter(function (card) {
        var rec = progress[card.id];
        if (!rec || !rec.attempts) return false;
        var accuracy = rec.correct / rec.attempts;
        return accuracy < 0.7 || (rec.box || 0) <= 1;
      });
      if (weak.length) {
        pool = weak;
      } else {
        notice = "No weak spots yet. This session uses the whole selection.";
      }
    }

    if (!pool.length) return { ids: [], notice: "No cards match these filters." };

    var shuffled = shuffle(pool);
    var limit = Number(settings.limit) || 0;
    if (limit > 0 && shuffled.length > limit) shuffled = shuffled.slice(0, limit);

    return {
      ids: shuffled.map(function (card) {
        return card.id;
      }),
      notice: notice
    };
  }

  root.PeridotSRS = {
    intervals: INTERVALS,
    todayISO: todayISO,
    addDays: addDays,
    isDue: isDue,
    review: review,
    shuffle: shuffle,
    buildQueue: buildQueue
  };
})(window);
