/* Rendering helpers. All user answers are inserted with textContent. */
(function (root) {
  "use strict";

  var TYPE_LABELS = {
    vocab: "Vocabulary in context",
    literal: "Literal paraphrase",
    figurative: "Figurative language",
    language: "Use of language",
    term: "Concept / term"
  };

  var els = {
    cardView: document.getElementById("cardView"),
    summaryView: document.getElementById("summaryView"),
    emptyView: document.getElementById("emptyView"),
    meta: document.getElementById("meta"),
    sentence: document.getElementById("sentence"),
    answerForm: document.getElementById("answerForm"),
    answer: document.getElementById("answer"),
    checkBtn: document.getElementById("checkBtn"),
    counter: document.getElementById("counter"),
    feedback: document.getElementById("feedback"),
    hints: document.getElementById("hints"),
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    scoreLine: document.getElementById("scoreLine"),
    paperLine: document.getElementById("paperLine"),
    summaryScore: document.getElementById("summaryScore"),
    summaryLine: document.getElementById("summaryLine"),
    summaryMissed: document.getElementById("summaryMissed"),
    retryMissed: document.getElementById("retryMissed"),
    newSession: document.getElementById("newSession"),
    summaryStats: document.getElementById("summaryStats"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyLine: document.getElementById("emptyLine"),
    emptyPractice: document.getElementById("emptyPractice"),
    emptySettings: document.getElementById("emptySettings"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsForm: document.getElementById("settingsForm"),
    paperOptions: document.getElementById("paperOptions"),
    typeOptions: document.getElementById("typeOptions"),
    modeSelect: document.getElementById("modeSelect"),
    limitSelect: document.getElementById("limitSelect"),
    showMeta: document.getElementById("showMeta"),
    showHints: document.getElementById("showHints"),
    storageNote: document.getElementById("storageNote"),
    statsDialog: document.getElementById("statsDialog"),
    statsBody: document.getElementById("statsBody")
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showView(name) {
    els.cardView.hidden = name !== "card";
    els.summaryView.hidden = name !== "summary";
    els.emptyView.hidden = name !== "empty";
  }

  function renderSentence(sentence, target) {
    els.sentence.textContent = "";
    var at = sentence.indexOf(target);
    if (at === -1) {
      els.sentence.textContent = sentence;
      return;
    }
    els.sentence.append(document.createTextNode(sentence.slice(0, at)));
    var span = el("span", "target", target);
    els.sentence.append(span);
    els.sentence.append(document.createTextNode(sentence.slice(at + target.length)));
  }

  function renderCard(card, index, total, settings) {
    showView("card");
    clearFeedback();

    els.meta.textContent = settings.showMeta
      ? card.paper + "  ·  " + (TYPE_LABELS[card.questionType] || card.questionType) +
        "  ·  " + card.marks + (card.marks === 1 ? " mark" : " marks")
      : "";
    els.meta.hidden = !settings.showMeta;

    renderSentence(card.sentence, card.target);

    els.answer.value = "";
    els.answer.disabled = false;
    els.answerForm.classList.remove("locked");
    els.checkBtn.disabled = false;
    els.checkBtn.innerHTML = "Check <kbd>↵</kbd>";
    els.counter.textContent = "0 words";
    els.hints.hidden = !settings.showHints;
    els.paperLine.textContent = card.paperShort + "  ·  " + (TYPE_LABELS[card.questionType] || card.questionType);

    setProgress(index, total);
    resizeAnswer();
    requestAnimationFrame(function () {
      els.answer.focus();
    });
  }

  function setProgress(index, total) {
    els.progressText.textContent = total ? Math.min(index + 1, total) + " / " + total : "0 / 0";
    var pct = total ? Math.round((index / total) * 100) : 0;
    els.progressBar.style.width = pct + "%";
  }

  function resizeAnswer() {
    els.answer.style.height = "auto";
    els.answer.style.height = Math.max(56, els.answer.scrollHeight) + "px";
  }

  function clearFeedback() {
    els.feedback.hidden = true;
    els.feedback.textContent = "";
  }

  function statusIcon(status) {
    if (status === "hit") return "✓";
    if (status === "near") return "≈";
    if (status === "forbidden") return "×";
    return "·";
  }

  function renderFeedback(card, result, manual) {
    els.feedback.textContent = "";

    var head = el("div", "feedback-head");
    var verdict = el("span", "verdict " + result.verdict);
    var label = result.verdict === "correct" ? "Correct" :
      result.verdict === "partial" ? "Partly there" : "Not yet";
    verdict.textContent = result.score + " / " + result.max + "  ·  " + label;
    head.append(verdict);

    if (manual) {
      head.append(el("span", "badge", manual === "correct" ? "self-marked correct" : "self-marked wrong"));
    } else if (result.borderline) {
      head.append(el("span", "badge", "close — check the expected answer"));
    }
    els.feedback.append(head);

    var list = el("ul", "concept-list");
    result.concepts.forEach(function (c) {
      var li = el("li", "concept " + c.status);
      li.append(el("span", "icon", statusIcon(c.status)));
      var body = el("div");
      body.append(el("span", "label", c.label));
      if (c.evidence) {
        var prefix = c.status === "hit" ? "Matched: " : "Near: ";
        body.append(el("span", "evidence", prefix + "“" + c.evidence + "”"));
      }
      li.append(body);
      list.append(li);
    });
    els.feedback.append(list);

    var answers = el("div", "answer-block");
    answers.append(el("h3", null, "Expected answer"));
    card.modelAnswers.forEach(function (text) {
      answers.append(el("p", null, text));
    });
    els.feedback.append(answers);

    var note = el("p", "note");
    var strong = el("strong", null, "Why: ");
    note.append(strong, document.createTextNode(card.note));
    els.feedback.append(note);

    if (card.doNotAccept && card.doNotAccept.length) {
      var details = el("details", "dna");
      details.append(el("summary", null, "Do not accept"));
      var ul = el("ul");
      card.doNotAccept.forEach(function (text) {
        ul.append(el("li", null, text));
      });
      details.append(ul);
      els.feedback.append(details);
    }

    var actions = el("div", "feedback-actions");
    var right = el("button", manual === "correct" ? "is-active" : "", "I was right");
    right.type = "button";
    right.dataset.override = "right";
    var wrong = el("button", manual === "wrong" ? "is-active" : "", "I was wrong");
    wrong.type = "button";
    wrong.dataset.override = "wrong";
    var spacer = el("span", "spacer");
    var next = el("button", "primary");
    next.type = "button";
    next.dataset.next = "1";
    next.innerHTML = "Next <kbd>↵</kbd>";
    actions.append(right, wrong, spacer, next);
    els.feedback.append(actions);

    els.feedback.hidden = false;
    els.answer.disabled = true;
    els.answerForm.classList.add("locked");
    els.checkBtn.disabled = true;
    if (typeof els.feedback.scrollIntoView === "function") {
      els.feedback.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function renderSummary(results, cardsById) {
    showView("summary");
    var score = results.reduce(function (s, r) { return s + r.score; }, 0);
    var max = results.reduce(function (s, r) { return s + r.max; }, 0);
    var correct = results.filter(function (r) { return r.score >= r.max; }).length;
    var pct = max ? Math.round((score / max) * 100) : 0;

    els.summaryScore.textContent = score + " / " + max;
    els.summaryLine.textContent = correct + " of " + results.length +
      (results.length === 1 ? " card" : " cards") + " correct  ·  " + pct + "% of available marks";

    els.summaryMissed.textContent = "";
    var missed = results.filter(function (r) { return r.score < r.max; });
    if (missed.length) {
      els.summaryMissed.append(el("p", "eyebrow", "MISSED"));
      missed.forEach(function (r) {
        var card = cardsById[r.id];
        if (!card) return;
        var row = el("div", "missed-row");
        row.append(el("b", null, card.target));
        row.append(el("div", null, card.sentence));
        row.append(el("span", null, r.score + "/" + r.max));
        els.summaryMissed.append(row);
      });
    } else {
      els.summaryMissed.append(el("p", "summary-line", "Clean sweep. Every card was fully paraphrased."));
    }

    els.retryMissed.disabled = !missed.length;
    els.retryMissed.dataset.missed = missed.map(function (r) { return r.id; }).join(",");
  }

  function renderEmpty(title, line) {
    showView("empty");
    els.emptyTitle.textContent = title;
    els.emptyLine.textContent = line;
  }

  function chip(container, name, value, text, checked) {
    var label = el("label", "chip");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    input.checked = !!checked;
    label.append(input, el("span", null, text));
    container.append(label);
  }

  function renderSettings(settings, papers, types) {
    els.modeSelect.value = settings.mode;
    els.limitSelect.value = String(settings.limit);
    els.showMeta.checked = !!settings.showMeta;
    els.showHints.checked = !!settings.showHints;

    els.paperOptions.textContent = "";
    papers.forEach(function (paper) {
      chip(els.paperOptions, "papers", paper, paper, settings.papers.indexOf(paper) !== -1);
    });

    els.typeOptions.textContent = "";
    types.forEach(function (type) {
      chip(els.typeOptions, "types", type, TYPE_LABELS[type] || type, settings.types.indexOf(type) !== -1);
    });

    els.storageNote.textContent = root.ParaStorage.isPersistent()
      ? "Progress is saved in this browser. Export a backup if you want to keep it elsewhere."
      : "This browser is blocking storage (often the case on file://). Progress will last for this tab only. Use a local server, or Export before closing.";
  }

  function readSettings() {
    var checked = function (selector) {
      return Array.prototype.slice.call(els.settingsForm.querySelectorAll(selector + " input:checked"))
        .map(function (input) { return input.value; });
    };
    return {
      mode: els.modeSelect.value,
      limit: Number(els.limitSelect.value) || 0,
      papers: checked("#paperOptions"),
      types: checked("#typeOptions"),
      showMeta: els.showMeta.checked,
      showHints: els.showHints.checked
    };
  }

  function barRow(label, correct, attempts) {
    var row = el("div", "bar-row");
    row.append(el("span", null, label));
    var bar = el("div", "bar");
    var fill = document.createElement("i");
    var pct = attempts ? Math.round((correct / attempts) * 100) : 0;
    fill.style.width = pct + "%";
    bar.append(fill);
    row.append(bar);
    row.append(el("em", null, attempts ? pct + "%" : "—"));
    return row;
  }

  function renderStats(state, cards) {
    var body = els.statsBody;
    body.textContent = "";

    var progress = state.progress || {};
    var attempts = 0;
    var correct = 0;
    var seen = 0;
    Object.keys(progress).forEach(function (id) {
      var rec = progress[id];
      if (!rec || !rec.attempts) return;
      seen++;
      attempts += rec.attempts;
      correct += rec.correct || 0;
    });

    var grid = el("div", "stats-grid");
    var stats = [
      [attempts, "attempts"],
      [attempts ? Math.round((correct / attempts) * 100) + "%" : "—", "accuracy"],
      [seen + " / " + cards.length, "cards seen"],
      [state.stats.bestStreak || 0, "best streak"],
      [state.stats.streak || 0, "current streak"],
      [correct, "fully correct"]
    ];
    stats.forEach(function (pair) {
      var box = el("div", "stat");
      box.append(el("b", null, String(pair[0])));
      box.append(el("span", null, pair[1]));
      grid.append(box);
    });
    body.append(grid);

    if (!attempts) {
      body.append(el("p", "stats-empty", "No attempts yet. Finish a few cards and your accuracy will appear here."));
      return;
    }

    var byPaper = {};
    var byType = {};
    cards.forEach(function (card) {
      var rec = progress[card.id];
      if (!rec || !rec.attempts) return;
      if (!byPaper[card.paperShort]) byPaper[card.paperShort] = { a: 0, c: 0 };
      byPaper[card.paperShort].a += rec.attempts;
      byPaper[card.paperShort].c += rec.correct || 0;
      var label = TYPE_LABELS[card.questionType] || card.questionType;
      if (!byType[label]) byType[label] = { a: 0, c: 0 };
      byType[label].a += rec.attempts;
      byType[label].c += rec.correct || 0;
    });

    function section(title, bucket) {
      body.append(el("h3", null, title));
      Object.keys(bucket).sort().forEach(function (key) {
        body.append(barRow(key, bucket[key].c, bucket[key].a));
      });
    }

    section("By paper", byPaper);
    section("By question type", byType);

    var weak = cards.filter(function (card) {
      var rec = progress[card.id];
      return rec && rec.attempts >= 1 && rec.correct < rec.attempts;
    }).map(function (card) {
      var rec = progress[card.id];
      return {
        card: card,
        accuracy: rec.correct / rec.attempts,
        attempts: rec.attempts
      };
    }).sort(function (a, b) {
      return a.accuracy - b.accuracy || b.attempts - a.attempts;
    }).slice(0, 8);

    body.append(el("h3", null, "Weakest words"));
    if (!weak.length) {
      body.append(el("p", "stats-empty", "Nothing missed yet."));
    } else {
      var list = el("div", "weak-list");
      weak.forEach(function (item) {
        var row = el("div", "weak-row");
        var left = el("div");
        left.append(el("b", null, item.card.target + "  "));
        left.append(document.createTextNode(item.card.paperShort));
        row.append(left);
        row.append(el("span", null,
          Math.round(item.accuracy * 100) + "% over " + item.attempts +
          (item.attempts === 1 ? " attempt" : " attempts")));
        list.append(row);
      });
      body.append(list);
    }
  }

  function updateStatus(state) {
    var attempts = state.stats.attempts || 0;
    var correct = state.stats.correct || 0;
    var streak = state.stats.streak || 0;
    els.scoreLine.textContent = correct + " correct  ·  " + attempts + " attempted" +
      (streak > 1 ? "  ·  " + streak + " streak" : "");
  }

  root.ParaUI = {
    els: els,
    TYPE_LABELS: TYPE_LABELS,
    showView: showView,
    renderCard: renderCard,
    renderFeedback: renderFeedback,
    renderSummary: renderSummary,
    renderEmpty: renderEmpty,
    renderSettings: renderSettings,
    readSettings: readSettings,
    renderStats: renderStats,
    updateStatus: updateStatus,
    setProgress: setProgress,
    resizeAnswer: resizeAnswer,
    clearFeedback: clearFeedback
  };
})(window);
