/* app.js — the operating layer.
   Every pickup restarts the interrogation. The mins-since-checked
   clock is real. The dossier is real. */

(() => {
  const screens = {
    lock: document.getElementById("screen-lock"),
    reason: document.getElementById("screen-reason"),
    home: document.getElementById("screen-home")
  };

  let current = "lock";

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("is-active"));
    screens[name].classList.add("is-active");
    current = name;
  }

  /* ---------- toast (the system's polite receipts) ---------- */

  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), ms);
  }

  /* ---------- clocks ---------- */

  function tick() {
    const now = new Date();

    document.querySelectorAll("[data-time-words]").forEach((el) => {
      el.innerHTML = TimeWords.stacked(now);
    });
    document.querySelectorAll("[data-time-words-inline]").forEach((el) => {
      el.innerHTML = `${TimeWords.inline(now)}&nbsp;&nbsp;…`;
    });

    const mins = String(Store.minsSinceChecked()).padStart(2, "0");
    document.querySelectorAll("[data-mins-since]").forEach((el) => {
      el.textContent = mins;
    });
  }
  tick();
  setInterval(tick, 5000);

  /* ---------- battery (real, when the device allows) ---------- */

  function paintBattery(level) {
    const pct = Math.round(level * 100) + "%";
    document.querySelectorAll("[data-battery]").forEach((el) => {
      el.textContent = pct;
    });
  }
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      paintBattery(b.level);
      b.addEventListener("levelchange", () => paintBattery(b.level));
    });
  }

  /* ---------- lock screen ---------- */

  document.getElementById("unlock-trigger").addEventListener("click", () => {
    show("reason");
    Unlock.begin((reason) => {
      Store.recordUnlock(reason);
      show("home");
      const n = Store.pickupsToday();
      toast(`Reason recorded. Pickup ${n} today.`);
    });
  });

  /* the masked pill opens the shade — which resolves nothing */
  document.getElementById("notif-pill").addEventListener("click", () => {
    Overlays.open("notifs");
  });

  document.querySelectorAll("[data-shortcut]").forEach((btn) => {
    btn.addEventListener("click", () => {
      toast("This shortcut is reserved for a future version of you.");
    });
  });

  /* ---------- home screen ---------- */

  document.getElementById("ai-search").addEventListener("click", () => {
    Overlays.open("ai");
  });

  document.querySelectorAll(".dock__app").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.app === "oversmart") {
        Overlays.open("ai");
        return;
      }
      toast(`“${btn.dataset.app}” will open once opening has been justified.`);
    });
  });

  /* ---------- AI sheet ---------- */

  document.getElementById("ai-pill").addEventListener("click", () => {
    OversmartAI.onPill();
  });

  /* ---------- app drawer feed events ---------- */

  document.addEventListener("app:open", (e) => {
    Overlays.close();
    toast(`“${e.detail.name}” noted your enthusiasm. Opening is queued.`);
  });
  document.addEventListener("app:like", (e) => {
    toast(`You liked “${e.detail.name}”. ${e.detail.name} liked that.`);
  });
  document.addEventListener("app:trash", (e) => {
    toast(`“${e.detail.name}” cannot be uninstalled at this time.`);
  });

  /* ---------- usage clock (real): feeds the shade header ---------- */

  const USAGE_TICK = 5000;
  setInterval(() => {
    if (document.visibilityState === "visible") {
      Store.addUsage(USAGE_TICK);
    }
    const mins = Store.usageMinsToday();
    document.querySelectorAll("[data-usage-mins]").forEach((el) => {
      el.textContent = mins;
    });
  }, USAGE_TICK);

  /* ---------- put-down detection: every return is a fresh pickup ----------
     When the page is hidden (screen off, app switched), the phone is
     considered "put down". The mins-since-checked clock resets its base,
     the session ends, and the interrogation restarts on return. */

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      Store.markPutDown();
      Unlock.cancel();
      Overlays.close();
      if (window.OversmartAI) OversmartAI.reset();
      show("lock");
      tick();
    } else {
      tick();
    }
  });

  /* first boot: no lastChecked yet — start the record now */
  if (Store.minsSinceChecked() === 0 && Store.pickupsToday() === 0) {
    Store.markPutDown();
  }

  /* ---------- service worker ---------- */

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
