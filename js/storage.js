/* Persistent state with a safe in-memory fallback. */
(function (root) {
  "use strict";

  var KEY = "peridot.v1";
  var LEGACY_KEY = "para.v1";

  var DEFAULTS = {
    version: 1,
    section: "paraphrase",
    settings: {
      mode: "practice",
      papers: [],
      types: [],
      limit: 20,
      showMeta: true,
      showHints: true,
      synonymSeconds: 60,
      synonymReview: true
    },
    progress: {},
    stats: {
      attempts: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      startedAt: null
    },
    session: null,
    corrections: [],
    synonymGame: {
      highScore: 0,
      bestStreak: 0,
      rounds: 0,
      lastScore: 0,
      lastAt: null
    }
  };

  var memory = null;
  var persistent = true;

  try {
    var probe = "__peridot_probe__";
    root.localStorage.setItem(probe, "1");
    root.localStorage.removeItem(probe);
  } catch (err) {
    persistent = false;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function merge(base, saved) {
    var out = clone(base);
    if (!saved || typeof saved !== "object") return out;
    Object.keys(saved).forEach(function (key) {
      var value = saved[key];
      if (value && typeof value === "object" && !Array.isArray(value) &&
          out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
        out[key] = merge(out[key], value);
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  function readRaw() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (raw !== null) return raw;

      // Carry progress over from the app's earlier "para.v1" key.
      var legacy = root.localStorage.getItem(LEGACY_KEY);
      if (legacy === null) return null;
      try {
        root.localStorage.setItem(KEY, legacy);
        root.localStorage.removeItem(LEGACY_KEY);
      } catch (err) {
        // Keep reading the old copy even if it cannot be migrated.
      }
      return legacy;
    } catch (err) {
      persistent = false;
      return null;
    }
  }

  function load() {
    if (!persistent) {
      if (!memory) memory = clone(DEFAULTS);
      return clone(memory);
    }
    try {
      var raw = readRaw();
      if (!raw) return clone(DEFAULTS);
      return merge(DEFAULTS, JSON.parse(raw));
    } catch (err) {
      return clone(DEFAULTS);
    }
  }

  function save(state) {
    memory = clone(state);
    if (!persistent) return false;
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      persistent = false;
      return false;
    }
  }

  function reset() {
    memory = clone(DEFAULTS);
    if (persistent) {
      try {
        root.localStorage.removeItem(KEY);
        root.localStorage.removeItem(LEGACY_KEY);
      } catch (err) {
        persistent = false;
      }
    }
    return clone(DEFAULTS);
  }

  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.progress) {
      throw new Error("This does not look like a Peridot backup.");
    }
    return merge(DEFAULTS, parsed);
  }

  root.PeridotStorage = {
    load: load,
    save: save,
    reset: reset,
    exportJSON: exportJSON,
    importJSON: importJSON,
    isPersistent: function () {
      return persistent;
    }
  };
})(window);
