/* Persistent state with a safe in-memory fallback. */
(function (root) {
  "use strict";

  var KEY = "para.v1";

  var DEFAULTS = {
    version: 1,
    settings: {
      mode: "practice",
      papers: [],
      types: [],
      limit: 20,
      showMeta: true,
      showHints: true
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
    corrections: []
  };

  var memory = null;
  var persistent = true;

  try {
    var probe = "__para_probe__";
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

  function load() {
    if (!persistent) {
      if (!memory) memory = clone(DEFAULTS);
      return clone(memory);
    }
    try {
      var raw = root.localStorage.getItem(KEY);
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
      throw new Error("This does not look like a Paraphrase backup.");
    }
    return merge(DEFAULTS, parsed);
  }

  root.ParaStorage = {
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
