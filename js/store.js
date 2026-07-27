/* store.js — the phone keeps records. That is the point. */

const Store = (() => {
  const KEY = "osp-state-v1";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  const state = Object.assign(
    {
      lastChecked: null,   // epoch ms of the last time the phone was put down
      pickups: 0,          // total unlocks
      reasons: [],         // { text, at } — the dossier
      usageMs: 0,          // accumulated visible time today
      usageDay: null       // "YYYY-M-D" the usageMs belongs to
    },
    load()
  );

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  return {
    /* minutes since the phone was last put down */
    minsSinceChecked() {
      if (!state.lastChecked) return 0;
      return Math.max(0, Math.floor((Date.now() - state.lastChecked) / 60000));
    },

    markPutDown() {
      state.lastChecked = Date.now();
      save(state);
    },

    recordUnlock(reason) {
      state.pickups += 1;
      state.reasons.push({ text: reason, at: Date.now() });
      if (state.reasons.length > 200) state.reasons.shift();
      save(state);
    },

    pickupsToday() {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      return state.reasons.filter((r) => r.at >= dayStart.getTime()).length;
    },

    lastReason() {
      return state.reasons.length
        ? state.reasons[state.reasons.length - 1].text
        : null;
    },

    /* usage clock: call with elapsed ms while the app is visible */
    addUsage(ms) {
      if (state.usageDay !== todayKey()) {
        state.usageDay = todayKey();
        state.usageMs = 0;
      }
      state.usageMs += ms;
      save(state);
    },

    usageMinsToday() {
      if (state.usageDay !== todayKey()) return 0;
      return Math.floor(state.usageMs / 60000);
    },

    allReasons() {
      return state.reasons.slice();
    }
  };
})();
