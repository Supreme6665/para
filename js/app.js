/* Session lifecycle, input handling and persistence wiring. */
(function (root) {
  "use strict";

  var data = root.PERIDOT_DATA || { cards: [] };
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

  var matcher = root.PeridotMatcher.createMatcher({
    synonymGroups: (root.PERIDOT_SYNONYMS && root.PERIDOT_SYNONYMS.groups) || []
  });

  var synonymGroups = (root.PERIDOT_SYNONYMS && root.PERIDOT_SYNONYMS.groups) || [];
  var synonymConfig = root.PERIDOT_SYNONYM_GAME || {};
  var synonymIndex = root.PeridotSynonymEngine.buildIndex({
    cards: cards,
    groups: synonymGroups,
    config: synonymConfig
  });

  var UI = root.PeridotUI;
  var els = UI.els;
  var storage = root.PeridotStorage;
  var SRS = root.PeridotSRS;
  var SynonymUI = root.PeridotSynonymUI;

  var state = storage.load();
  var toastTimer = null;
  var paraphraseDraft = null;

  // ---- small helpers -----------------------------------------------------

  function today() {
    return SRS.todayISO();
  }

  function save() {
    storage.save(state);
    UI.updateStatus(state, state.section);
  }

  function normalizeSection(section) {
    return section === "synonyms" ? "synonyms" : "paraphrase";
  }

  function captureParaphraseDraft() {
    paraphraseDraft = null;
    var session = state.session;
    var card = currentCard();
    if (!session || !card || session.pending || isFinished(session)) return;
    var text = els.answer.value;
    if (text && text.trim()) paraphraseDraft = { id: card.id, text: text };
  }

  function restoreParaphraseDraft() {
    if (!paraphraseDraft) return;
    var session = state.session;
    var card = currentCard();
    if (session && !session.pending && card && card.id === paraphraseDraft.id) {
      els.answer.value = paraphraseDraft.text;
      updateCounter();
      UI.resizeAnswer();
    }
    paraphraseDraft = null;
  }

  function setSection(section) {
    section = normalizeSection(section);
    if (state.section === "paraphrase" && section === "synonyms") {
      captureParaphraseDraft();
    }
    state.section = section;
    if (section === "paraphrase") {
      els.paperLine.textContent = "Offline";
    }
    UI.setSection(section);
    save();
    if (section === "synonyms") {
      UI.showView("none");
      SynonymUI.show();
    } else {
      SynonymUI.hide();
      resume();
      restoreParaphraseDraft();
    }
  }

  function recordSynonymRound(summary) {
    var game = state.synonymGame || (state.synonymGame = {
      highScore: 0,
      bestStreak: 0,
      rounds: 0,
      lastScore: 0,
      lastAt: null
    });
    var isBest = summary.score > (game.highScore || 0);
    game.rounds = (game.rounds || 0) + 1;
    game.lastScore = summary.score;
    game.highScore = Math.max(game.highScore || 0, summary.score);
    game.bestStreak = Math.max(game.bestStreak || 0, summary.bestStreak || 0);
    game.lastAt = new Date().toISOString();
    save();
    return {
      isBest: isBest,
      highScore: game.highScore,
      bestStreak: game.bestStreak
    };
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

  function startSession(idsOverride, opts) {
    var silent = !!(opts && opts.silent);
    var queue;
    if (idsOverride) {
      queue = { ids: idsOverride.slice(), notice: "" };
    } else {
      queue = SRS.buildQueue(cards, state.settings, state.progress, today());
    }

    if (!queue.ids.length) {
      state.session = null;
      save();
      if (!silent) {
        UI.setProgress(0, 0);
        UI.renderEmpty(
          "No cards match",
          queue.notice || "Change the paper or question-type filters in settings, then try again."
        );
      }
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
    if (!silent) {
      renderCurrent();
      if (queue.notice) toast(queue.notice);
    }
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
    SynonymUI.pause();
    UI.renderSettings(state.settings, papers, types);
    openDialog(els.settingsDialog);
  }

  function sessionSettingsChanged(previous, next) {
    return previous.mode !== next.mode ||
      previous.limit !== next.limit ||
      JSON.stringify(previous.papers) !== JSON.stringify(next.papers) ||
      JSON.stringify(previous.types) !== JSON.stringify(next.types);
  }

  function resumeGameIfReady() {
    if (state.section === "synonyms" && !anyDialogOpen()) SynonymUI.resume();
  }

  function applySettings() {
    var previous = state.settings;
    var next = UI.readSettings();
    var session = state.session;
    var inProgress = session && !isFinished(session) &&
      (session.pending || session.results.length > 0);
    var sessionChanged = sessionSettingsChanged(previous, next);
    var displayChanged = previous.showMeta !== next.showMeta ||
      previous.showHints !== next.showHints;

    if (sessionChanged && inProgress &&
        !root.confirm("Apply these settings and start a new session?")) {
      UI.renderSettings(state.settings, papers, types);
      return;
    }

    state.settings = next;
    save();
    closeDialog(els.settingsDialog);
    SynonymUI.refreshSettings();

    if (state.section === "synonyms") {
      if (sessionChanged) startSession(null, { silent: true });
      resumeGameIfReady();
    } else if (sessionChanged) {
      startSession(null);
    } else if (displayChanged && session && !isFinished(session)) {
      captureParaphraseDraft();
      renderCurrent();
      restoreParaphraseDraft();
    }
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
    link.download = "peridot-" + today() + ".json";
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
        SynonymUI.reset();
        setSection(state.section);
        resumeGameIfReady();
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
    SynonymUI.reset();
    UI.renderSettings(state.settings, papers, types);
    closeDialog(els.settingsDialog);
    closeDialog(els.statsDialog);
    setSection(state.section);
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
  document.getElementById("modeCards").addEventListener("click", function () {
    setSection("paraphrase");
  });
  document.getElementById("modeSynonyms").addEventListener("click", function () {
    setSection("synonyms");
  });
  document.getElementById("settingsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    applySettings();
  });

  document.addEventListener("click", function (event) {
    var close = event.target.closest("[data-close]");
    if (!close) return;
    closeDialog(close.closest("dialog"));
    resumeGameIfReady();
  });

  els.settingsDialog.addEventListener("close", resumeGameIfReady);
  els.statsDialog.addEventListener("close", resumeGameIfReady);

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

    if (state.section === "synonyms") {
      if (SynonymUI.handleKey(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        openSettings();
      }
      return;
    }

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

  SynonymUI.init({
    index: synonymIndex,
    getRoundSeconds: function () {
      return state.settings.synonymSeconds;
    },
    getRecords: function () {
      return state.synonymGame;
    },
    onRoundEnd: recordSynonymRound,
    onRequestSection: setSection,
    toast: toast
  });

  document.addEventListener("visibilitychange", function () {
    if (state.section !== "synonyms") return;
    if (document.hidden) SynonymUI.pause();
    else resumeGameIfReady();
  });

  setSection(state.section);
})(window);
