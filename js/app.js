/* Session lifecycle, input handling and persistence wiring. */
(function (root) {
  "use strict";

  var data = root.PARA_DATA || { cards: [] };
  var cards = Array.isArray(data.cards) ? data.cards : [];
  var cardsById = {};
  cards.forEach(function (card) {
    cardsById[card.id] = card;
  });

  var papers = data.papers || [];
  var types = data.types || [];
  if (!papers.length) {
    cards.forEach(function (card) {
      if (papers.indexOf(card.paper) === -1) papers.push(card.paper);
    });
  }
  if (!types.length) {
    cards.forEach(function (card) {
      if (types.indexOf(card.questionType) === -1) types.push(card.questionType);
    });
    types.sort();
  }

  var matcher = root.ParaMatcher.createMatcher({
    synonymGroups: (root.PARA_SYNONYMS && root.PARA_SYNONYMS.groups) || []
  });

  var UI = root.ParaUI;
  var els = UI.els;
  var storage = root.ParaStorage;
  var SRS = root.ParaSRS;

  var state = storage.load();
  var toastTimer = null;

  // ---- small helpers -----------------------------------------------------

  function today() {
    return SRS.todayISO();
  }

  function save() {
    storage.save(state);
    UI.updateStatus(state);
  }

  function currentCard() {
    var session = state.session;
    if (!session) return null;
    return cardsById[session.ids[session.index]] || null;
  }

  function isFinished(session) {
    return !session || !session.ids || session.index >= session.ids.length;
  }

  function dialogOpen(dialog) {
    if (!dialog) return false;
    if (typeof dialog.showModal === "function") return dialog.open;
    return dialog.hasAttribute("open");
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function anyDialogOpen() {
    return dialogOpen(els.settingsDialog) || dialogOpen(els.statsDialog);
  }

  function toast(message) {
    var node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    document.body.append(node);
    requestAnimationFrame(function () {
      node.classList.add("show");
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove("show");
      setTimeout(function () {
        if (node.parentNode) node.remove();
      }, 220);
    }, 2800);
  }

  function wordCount(text) {
    var trimmed = String(text || "").trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function updateCounter() {
    var n = wordCount(els.answer.value);
    els.counter.textContent = n + (n === 1 ? " word" : " words");
  }

  function focusNext() {
    var next = els.feedback.querySelector("[data-next]");
    if (next) next.focus();
  }

  // ---- progress ----------------------------------------------------------

  function commitResult(card, result, previousRecord) {
    state.progress[card.id] = SRS.review(previousRecord, result, today());
    state.stats.attempts = (state.stats.attempts || 0) + 1;
    if (result.score >= result.max) {
      state.stats.correct = (state.stats.correct || 0) + 1;
      state.stats.streak = (state.stats.streak || 0) + 1;
      state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, state.stats.streak);
    } else {
      state.stats.streak = 0;
    }
    state.stats.startedAt = state.stats.startedAt || new Date().toISOString();
  }

  // ---- session lifecycle -------------------------------------------------

  function startSession(idsOverride) {
    var queue;
    if (idsOverride) {
      queue = { ids: idsOverride.slice(), notice: "" };
    } else {
      queue = SRS.buildQueue(cards, state.settings, state.progress, today());
    }

    if (!queue.ids.length) {
      state.session = null;
      save();
      UI.setProgress(0, 0);
      UI.renderEmpty(
        "No cards match",
        queue.notice || "Change the paper or question-type filters in settings, then try again."
      );
      return;
    }

    state.session = {
      ids: queue.ids,
      index: 0,
      results: [],
      skipped: 0,
      mode: state.settings.mode,
      notice: queue.notice || "",
      startedAt: new Date().toISOString(),
      pending: null
    };
    save();
    renderCurrent();
    if (queue.notice) toast(queue.notice);
  }

  function renderCurrent() {
    var session = state.session;
    if (!session) {
      startSession(null);
      return;
    }

    if (isFinished(session)) {
      finishSession();
      return;
    }

    var card = cardsById[session.ids[session.index]];
    if (!card) {
      session.index += 1;
      renderCurrent();
      return;
    }

    UI.renderCard(card, session.index, session.ids.length, state.settings);

    if (session.pending && session.pending.id === card.id) {
      els.answer.value = session.pending.answer;
      updateCounter();
      UI.renderFeedback(card, session.pending.result, session.pending.result.manual || null);
      focusNext();
    }
  }

  function finishSession() {
    var session = state.session;
    if (!session) {
      startSession(null);
      return;
    }
    UI.setProgress(session.ids.length, session.ids.length);
    save();
    UI.renderSummary(session.results, cardsById);
    if (session.skipped) {
      toast("Skipped " + session.skipped + (session.skipped === 1 ? " card." : " cards."));
    }
  }

  function submitAnswer() {
    var session = state.session;
    if (!session) return;

    if (session.pending) {
      advance();
      return;
    }

    var card = currentCard();
    if (!card) return;

    var text = els.answer.value.trim();
    if (!text) {
      toast("Type a paraphrase first.");
      els.answer.focus();
      return;
    }

    var result = matcher.grade(card, text);
    result.id = card.id;
    var previous = state.progress[card.id] ? clone(state.progress[card.id]) : null;

    commitResult(card, result, previous);
    session.pending = {
      id: card.id,
      answer: text,
      result: result,
      prevRecord: previous
    };
    save();
    UI.renderFeedback(card, result, null);
    focusNext();
  }

  function advance() {
    var session = state.session;
    if (!session) return;

    if (session.pending) {
      session.results.push(Object.assign({ id: session.pending.id }, session.pending.result));
      session.pending = null;
    }
    session.index += 1;
    save();

    if (isFinished(session)) finishSession();
    else renderCurrent();
  }

  function skipCard() {
    var session = state.session;
    if (!session) return;
    if (session.pending) {
      advance();
      return;
    }
    session.index += 1;
    session.skipped = (session.skipped || 0) + 1;
    save();
    if (isFinished(session)) finishSession();
    else renderCurrent();
  }

  function override(which) {
    var session = state.session;
    if (!session || !session.pending) return;
    var card = cardsById[session.pending.id];
    if (!card) return;

    var result = session.pending.result;
    var manual = which === "right" ? "correct" : "wrong";
    if (result.manual === manual) return;

    var wasCorrect = result.score >= result.max;
    if (which === "right") {
      result.score = result.max;
      result.verdict = "correct";
    } else {
      result.score = 0;
      result.verdict = "miss";
    }
    result.manual = manual;
    result.borderline = false;

    var nowCorrect = which === "right";

    // Recompute the record from the pre-attempt snapshot so override
    // never inflates attempt counts.
    state.progress[card.id] = SRS.review(session.pending.prevRecord, result, today());

    if (nowCorrect !== wasCorrect) {
      if (nowCorrect) {
        state.stats.correct = (state.stats.correct || 0) + 1;
        state.stats.streak = (state.stats.streak || 0) + 1;
        state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, state.stats.streak);
      } else {
        state.stats.correct = Math.max(0, (state.stats.correct || 0) - 1);
        state.stats.streak = 0;
      }
    }

    save();
    UI.renderFeedback(card, result, manual);
    focusNext();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // ---- settings ----------------------------------------------------------

  function openSettings() {
    UI.renderSettings(state.settings, papers, types);
    openDialog(els.settingsDialog);
  }

  function applySettings() {
    var next = UI.readSettings();
    var session = state.session;
    var inProgress = session && !isFinished(session) &&
      (session.pending || session.results.length > 0);

    if (inProgress && !root.confirm("Apply these settings and start a new session?")) {
      UI.renderSettings(state.settings, papers, types);
      return;
    }

    state.settings = next;
    save();
    closeDialog(els.settingsDialog);
    startSession(null);
  }

  // ---- stats / data ------------------------------------------------------

  function openStats() {
    closeDialog(els.settingsDialog);
    UI.renderStats(state, cards);
    openDialog(els.statsDialog);
  }

  function exportData() {
    var blob = new Blob([storage.exportJSON(state)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "paraphrase-" + today() + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
    toast("Backup downloaded.");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = storage.importJSON(String(reader.result || ""));
        save();
        closeDialog(els.settingsDialog);
        closeDialog(els.statsDialog);
        UI.renderSettings(state.settings, papers, types);
        resume();
        toast("Backup imported.");
      } catch (err) {
        toast("Could not import that file.");
      }
    };
    reader.onerror = function () {
      toast("Could not read that file.");
    };
    reader.readAsText(file);
  }

  function resetProgress() {
    if (!root.confirm("Reset all progress and settings? This cannot be undone.")) return;
    state = storage.reset();
    save();
    UI.renderSettings(state.settings, papers, types);
    closeDialog(els.settingsDialog);
    closeDialog(els.statsDialog);
    startSession(null);
    toast("Progress reset.");
  }

  // ---- resume ------------------------------------------------------------

  function resume() {
    var session = state.session;
    if (!session || !Array.isArray(session.ids) || !session.ids.length) {
      startSession(null);
      return;
    }

    // Drop cards that no longer exist after a dataset change.
    session.ids = session.ids.filter(function (id) {
      return !!cardsById[id];
    });
    if (!session.ids.length) {
      startSession(null);
      return;
    }
    if (session.results === undefined) session.results = [];
    if (session.index === undefined) session.index = 0;

    if (isFinished(session)) finishSession();
    else renderCurrent();
  }

  // ---- events ------------------------------------------------------------

  els.answerForm.addEventListener("submit", function (event) {
    event.preventDefault();
    submitAnswer();
  });

  els.answer.addEventListener("input", function () {
    updateCounter();
    UI.resizeAnswer();
  });

  els.feedback.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.next) {
      advance();
      return;
    }
    if (target.dataset.override === "right") {
      override("right");
      return;
    }
    if (target.dataset.override === "wrong") {
      override("wrong");
    }
  });

  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("settingsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    applySettings();
  });

  document.addEventListener("click", function (event) {
    var close = event.target.closest("[data-close]");
    if (!close) return;
    closeDialog(close.closest("dialog"));
  });

  document.getElementById("statsBtn").addEventListener("click", openStats);
  document.getElementById("summaryStats").addEventListener("click", openStats);
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", function () {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    if (file) importData(file);
    event.target.value = "";
  });
  document.getElementById("resetBtn").addEventListener("click", resetProgress);

  els.newSession.addEventListener("click", function () {
    startSession(null);
  });

  els.retryMissed.addEventListener("click", function () {
    var ids = String(els.retryMissed.dataset.missed || "")
      .split(",")
      .filter(Boolean);
    if (ids.length) startSession(ids);
  });

  els.emptyPractice.addEventListener("click", function () {
    startSession(null);
  });
  els.emptySettings.addEventListener("click", openSettings);

  document.addEventListener("keydown", function (event) {
    if (anyDialogOpen()) return;

    var tag = (event.target.tagName || "").toLowerCase();
    var inField = tag === "textarea" || tag === "input" || tag === "select";
    var buttonFocused = tag === "button";

    if (event.key === "Escape") {
      event.preventDefault();
      openSettings();
      return;
    }

    if (event.key === "Enter") {
      var pending = state.session && state.session.pending;
      if (buttonFocused) return;

      if (pending) {
        event.preventDefault();
        advance();
        return;
      }

      if (event.target === els.answer) {
        if (event.shiftKey) return; // newline
        event.preventDefault();
        submitAnswer();
      }
      return;
    }

    if (event.altKey && (event.key === "s" || event.key === "S")) {
      if (inField || buttonFocused) return;
      event.preventDefault();
      skipCard();
    }
  });

  // ---- boot --------------------------------------------------------------

  UI.updateStatus(state);
  resume();
})(window);
