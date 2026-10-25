/* Synonym Rush view controller: DOM, timer and round presentation. */
(function (root) {
  "use strict";

  var engine = root.PeridotSynonymEngine;

  var els = {};
  var options = {};
  var round = null;
  var timer = null;
  var roundReported = false;
  var lastReport = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getSeconds() {
    var value = options.getRoundSeconds ? Number(options.getRoundSeconds()) : 60;
    if (!isFinite(value) || value < 5) value = 60;
    return Math.min(600, Math.round(value));
  }

  function getRecords() {
    return (options.getRecords && options.getRecords()) || {};
  }

  function notify(message) {
    if (options.toast) options.toast(message);
  }

  function focusInput() {
    if (!els.input || els.input.disabled) return;
    if (typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(function () { els.input.focus(); });
    } else {
      setTimeout(function () { els.input.focus(); }, 0);
    }
  }

  function setView(name) {
    els.intro.hidden = name !== "intro";
    els.play.hidden = name !== "play";
    els.paused.hidden = name !== "paused";
    els.summary.hidden = name !== "summary";
  }

  // ---- rendering ---------------------------------------------------------

  function renderIntro() {
    setView("intro");
    var seconds = getSeconds();
    els.ruleTime.textContent = seconds + " sec";
    els.startBtn.textContent = "Start " + seconds + "-second round";
    var records = getRecords();
    var rounds = records.rounds || 0;
    if (rounds) {
      els.bestLine.textContent = "Personal best " + (records.highScore || 0) +
        " points  ·  best streak " + (records.bestStreak || 0) +
        "  ·  " + rounds + (rounds === 1 ? " round" : " rounds") + " played.";
    } else {
      els.bestLine.textContent = "No rounds yet. Sixty seconds is longer than it sounds.";
    }
  }

  function renderPrompt() {
    if (!round || !round.current) return;
    els.word.textContent = round.current.word;
    var papers = round.current.source.papers || [];
    els.source.textContent = papers.length
      ? "From " + papers.join(" · ")
      : "From the passage bank";
    els.feedback.textContent = "";
    els.feedback.className = "counter synonym-feedback";
    renderFound();
  }

  function renderFound() {
    els.found.textContent = "";
    var answers = round && round.currentAnswers ? round.currentAnswers : [];
    if (!answers.length) {
      els.found.append(el("span", "synonym-empty", "No synonyms yet — type one and press Enter."));
      return;
    }
    answers.forEach(function (answer) {
      var chip = el("span", "synonym-chip tier-" + answer.tier);
      chip.append(el("span", "synonym-chip-term", answer.term));
      chip.append(el("span", "synonym-chip-points", "+" + answer.points));
      chip.title = answer.tier + " synonym · " + answer.points + " points" +
        (answer.typo ? " · spelling corrected" : "");
      els.found.append(chip);
    });
  }

  function renderHud() {
    if (!round) return;
    var remaining = round.status === "over" ? 0 : round.remainingMs;
    var pct = round.durationMs ? Math.max(0, Math.min(100, (remaining / round.durationMs) * 100)) : 0;
    els.timerText.textContent = engine.formatTime(remaining);
    els.timerBar.style.width = pct + "%";
    els.timer.classList.toggle("is-low", round.status === "playing" && remaining <= 10000);
    els.timer.setAttribute("aria-label", engine.formatTime(remaining) + " remaining");
    els.score.textContent = String(round.score);
    els.streak.textContent = String(round.streak);
    els.wordNo.textContent = String(round.wordNo);
  }

  function renderPlay() {
    setView("play");
    renderPrompt();
    renderHud();
  }

  function renderPaused() {
    setView("paused");
    renderHud();
  }

  function renderSummary(summary, report) {
    setView("summary");
    if (!summary) return;
    var info = report || lastReport || {};
    els.finalScore.textContent = String(summary.score);
    var accuracy = Math.round((summary.accuracy || 0) * 100);
    var line = summary.acceptedCount + " accepted from " + summary.attemptCount +
      (summary.attemptCount === 1 ? " attempt" : " attempts") +
      "  ·  " + accuracy + "% accuracy  ·  " + summary.wordsPlayed +
      (summary.wordsPlayed === 1 ? " word" : " words");
    if (summary.duplicates) {
      line += "  ·  " + summary.duplicates +
        (summary.duplicates === 1 ? " duplicate" : " duplicates");
    }
    els.summaryLine.textContent = line;
    els.bestBadge.hidden = !info.isBest;

    els.summaryStats.textContent = "";
    var stats = [
      [summary.score, "points"],
      [accuracy + "%", "accuracy"],
      [summary.tierCounts.strong || 0, "strong"],
      [summary.tierCounts.close || 0, "close"],
      [summary.tierCounts.loose || 0, "loose"],
      [summary.bestStreak, "best chain"]
    ];
    stats.forEach(function (pair) {
      var box = el("div", "stat");
      box.append(el("b", null, String(pair[0])));
      box.append(el("span", null, pair[1]));
      els.summaryStats.append(box);
    });

    els.review.textContent = "";
    if (!summary.history.length) {
      els.review.append(el("p", "stats-empty", "No words played before the clock ran out."));
    } else {
      els.review.append(el("h3", null, "Round review"));
      summary.history.forEach(function (entry) {
        els.review.append(reviewRow(entry));
      });
    }
  }

  function reviewRow(entry) {
    var row = el("div", "review-row");
    var head = el("div", "review-head");
    head.append(el("b", null, entry.word));
    var papers = entry.source && entry.source.papers ? entry.source.papers : [];
    if (papers.length) head.append(el("span", "review-source", papers.join(" · ")));
    row.append(head);

    if (entry.source && entry.source.example) {
      row.append(el("p", "review-example", entry.source.example));
    }

    if (entry.found.length) {
      var found = el("p", "review-line");
      found.append(el("span", "review-label", "Found "));
      found.append(document.createTextNode(entry.found.map(function (answer) {
        return answer.term + " (" + answer.tier + ", +" + answer.points + ")";
      }).join(", ")));
      row.append(found);
    } else {
      row.append(el("p", "review-line review-none", "Nothing found."));
    }

    if (entry.missed.length) {
      row.append(el("p", "review-line review-missed", "Strong ones missed: " + entry.missed.join(", ")));
    }
    return row;
  }

  // ---- timer -------------------------------------------------------------

  function startTimer() {
    stopTimer();
    if (!round || round.status !== "playing") return;
    timer = root.setInterval(tick, 200);
    tick();
  }

  function stopTimer() {
    if (timer !== null) {
      root.clearInterval(timer);
      timer = null;
    }
  }

  function tick() {
    if (!round) return;
    var state = engine.tick(round);
    renderHud();
    if (state.status === "over") completeRound();
  }

  function completeRound() {
    if (!round) return;
    stopTimer();
    var summary = round.status === "over" && round.summary
      ? round.summary
      : engine.finish(round);
    if (!summary) return;
    if (!roundReported) {
      roundReported = true;
      lastReport = options.onRoundEnd ? options.onRoundEnd(summary) : null;
    }
    renderSummary(summary, lastReport);
  }

  // ---- actions -----------------------------------------------------------

  function startRound() {
    if (!options.index || !options.index.prompts || !options.index.prompts.length) {
      notify("The synonym bank is empty.");
      return;
    }
    var previousWord = round && round.current ? round.current.word : null;
    round = engine.createRound(options.index, {
      roundSeconds: getSeconds(),
      previousWord: previousWord
    });
    roundReported = false;
    lastReport = null;
    if (!round) {
      notify("Could not start a synonym round.");
      renderIntro();
      return;
    }
    els.input.value = "";
    els.input.disabled = false;
    renderPlay();
    startTimer();
    focusInput();
  }

  function submit() {
    if (!round) return;
    if (round.status === "paused") {
      notify("Resume the round first.");
      return;
    }
    if (round.status !== "playing") return;

    var text = els.input.value;
    var result = engine.submit(round, text);
    if (result.status === "empty") {
      focusInput();
      return;
    }
    if (result.status === "expired") {
      completeRound();
      return;
    }

    if (result.status === "accepted") {
      els.input.value = "";
      els.feedback.textContent = result.message;
      els.feedback.className = "counter synonym-feedback is-good";
      renderFound();
    } else if (result.status === "rejected") {
      els.input.select();
      els.feedback.textContent = result.message;
      els.feedback.className = "counter synonym-feedback is-bad";
    } else if (result.status === "unrecognized") {
      els.input.select();
      els.feedback.textContent = result.message;
      els.feedback.className = "counter synonym-feedback is-bad";
    } else if (result.status === "duplicate") {
      els.input.value = "";
      els.feedback.textContent = result.message;
      els.feedback.className = "counter synonym-feedback is-muted";
    }
    renderHud();
    if (result.status === "accepted" && engine.strongRemaining(round) === 0 && round.status === "playing") {
      els.feedback.textContent = "All strong synonyms found — press Alt+N for the next word.";
      els.feedback.className = "counter synonym-feedback is-good";
    }
    focusInput();
  }

  function nextWord() {
    if (!round || round.status !== "playing") return;
    engine.nextPrompt(round);
    els.input.value = "";
    renderPlay();
    renderHud();
    focusInput();
  }

  function endRound() {
    if (!round) return;
    if (round.status === "over") {
      renderSummary(round.summary, lastReport);
      return;
    }
    engine.finish(round);
    completeRound();
  }

  // ---- public view lifecycle --------------------------------------------

  function show() {
    els.view.hidden = false;
    refreshSettings();
    if (!round) {
      renderIntro();
    } else if (round.status === "over") {
      renderSummary(round.summary, lastReport);
    } else if (round.status === "paused") {
      renderPaused();
    } else {
      renderPlay();
      startTimer();
      focusInput();
    }
  }

  function hide() {
    pause();
    els.view.hidden = true;
  }

  function pause() {
    if (!round || round.status !== "playing") return;
    engine.pause(round);
    stopTimer();
    if (round.status === "over") {
      completeRound();
      return;
    }
    if (!els.view.hidden) renderPaused();
  }

  function resume() {
    if (els.view.hidden || !round) return;
    if (round.status !== "paused") return;
    engine.resume(round);
    if (round.status === "over") {
      completeRound();
    } else {
      renderPlay();
      startTimer();
      focusInput();
    }
  }

  function refreshSettings() {
    if (!els.ruleTime) return;
    var seconds = getSeconds();
    els.ruleTime.textContent = seconds + " sec";
    if (els.startBtn) els.startBtn.textContent = "Start " + seconds + "-second round";
  }

  function reset() {
    stopTimer();
    round = null;
    roundReported = false;
    lastReport = null;
    if (!els.view.hidden) renderIntro();
  }

  function handleKey(event) {
    if (!els.view || els.view.hidden) return false;

    if (event.altKey && (event.key === "n" || event.key === "N")) {
      if (round && round.status === "playing") {
        event.preventDefault();
        nextWord();
        return true;
      }
      return false;
    }

    if (event.key === "Enter") {
      // Let the form's own submit handler take Enter inside the input, and
      // let native buttons activate. Either way the paraphrase handler must
      // not see the key.
      if (event.target === els.input || event.target === els.form) return true;
      var tag = (event.target.tagName || "").toLowerCase();
      if (tag === "button") return true;
      if (round && round.status === "playing") {
        event.preventDefault();
        submit();
      }
      return true;
    }

    return false;
  }

  function init(config) {
    options = config || {};
    els = {
      view: byId("synonymView"),
      intro: byId("synonymIntro"),
      play: byId("synonymPlay"),
      paused: byId("synonymPaused"),
      summary: byId("synonymSummary"),
      startBtn: byId("synonymStartBtn"),
      backBtn: byId("synonymBackBtn"),
      summaryBackBtn: byId("synonymSummaryBackBtn"),
      resumeBtn: byId("synonymResumeBtn"),
      againBtn: byId("synonymAgainBtn"),
      ruleTime: byId("synonymRuleTime"),
      bestLine: byId("synonymBestLine"),
      timer: byId("synonymTimer"),
      timerText: byId("synonymTimerText"),
      timerBar: byId("synonymTimerBar"),
      score: byId("synonymScore"),
      streak: byId("synonymStreak"),
      wordNo: byId("synonymWordNo"),
      word: byId("synonymWord"),
      source: byId("synonymSource"),
      form: byId("synonymForm"),
      input: byId("synonymInput"),
      feedback: byId("synonymFeedback"),
      found: byId("synonymFound"),
      nextBtn: byId("synonymNextBtn"),
      endBtn: byId("synonymEndBtn"),
      finalScore: byId("synonymFinalScore"),
      summaryLine: byId("synonymSummaryLine"),
      bestBadge: byId("synonymBestBadge"),
      summaryStats: byId("synonymSummaryStats"),
      review: byId("synonymReview")
    };

    els.form.addEventListener("submit", function (event) {
      event.preventDefault();
      submit();
    });
    els.startBtn.addEventListener("click", startRound);
    els.againBtn.addEventListener("click", startRound);
    els.resumeBtn.addEventListener("click", resume);
    els.nextBtn.addEventListener("click", nextWord);
    els.endBtn.addEventListener("click", endRound);

    function backToCards() {
      if (options.onRequestSection) options.onRequestSection("paraphrase");
    }
    els.backBtn.addEventListener("click", backToCards);
    els.summaryBackBtn.addEventListener("click", backToCards);

    refreshSettings();
  }

  root.PeridotSynonymUI = {
    init: init,
    show: show,
    hide: hide,
    pause: pause,
    resume: resume,
    startRound: startRound,
    refreshSettings: refreshSettings,
    reset: reset,
    handleKey: handleKey
  };
})(window);
