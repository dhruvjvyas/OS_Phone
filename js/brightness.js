/* brightness.js — "screen brightness is set according to the amount of
   battery percentage."

   Battery saver, taken literally and taken all the way: brightness is not a
   setting that reacts to your battery, it IS your battery. As the percentage
   falls the screen falls with it, so the phone becomes progressively harder
   to look at precisely when you are least able to do anything about it.
   There is no toggle. The slider in quick settings still moves — and is
   overruled a moment later, which is the point.

   Implementation note: the dimming is a black overlay, NOT `filter:
   brightness()` on <body>. A filter on an ancestor creates a containing
   block, which breaks every `position: fixed` screen/overlay in this app and
   interferes with the `backdrop-filter` glass. An opacity layer has neither
   problem and is what actual screen-dimmer apps use. */

const Brightness = (() => {
  /* the screen never goes fully black — the phone still wants to be usable
     enough that you keep trying */
  const MIN = 0.32;
  const MAX = 1.0;

  /* how long the manual slider is allowed to feel like it worked */
  const OVERRIDE_MS = 2200;
  const RESPECT_USER = false; // set true to disable the reassertion

  const IDLE_DRAIN_MS = 8000;  // 1% every 8s — the ambient decline
  const SWEEP_MS = 260;        // 1% per tick during a demo sweep

  let level = 0.75;            // 0..1
  let realBattery = null;      // BatteryManager, when the browser allows
  let overrideUntil = 0;
  let overrideValue = null;
  let drainTimer = null;
  let sweep = null;            // {dir:-1|1, target:number}

  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  function dimmer() {
    return document.getElementById("screen-dimmer");
  }

  /* brightness the phone has decided on, given the battery */
  function brightnessForLevel(l) {
    return MIN + clamp01(l) * (MAX - MIN);
  }

  function render() {
    const el = dimmer();
    if (!el) return;

    const now = Date.now();
    const usingOverride = overrideValue !== null && now < overrideUntil;
    const b = usingOverride ? overrideValue : brightnessForLevel(level);

    /* a black veil at (1 - brightness) reads as a dimmer screen */
    el.style.opacity = String(clamp01(1 - b));

    const pct = Math.round(clamp01(level) * 100);
    document.querySelectorAll("[data-battery]").forEach((n) => {
      n.textContent = pct + "%";
    });
    const fill = document.getElementById("battery-fill-lock");
    if (fill) fill.setAttribute("width", String(Math.max(0.5, 12 * clamp01(level))));
  }

  function setLevel(next, { announce = false } = {}) {
    const before = Math.round(level * 100);
    level = clamp01(next);
    const after = Math.round(level * 100);
    render();
    if (announce && before !== after) {
      toast(`Battery ${after}%. Brightness adjusted to match.`);
    }
  }

  function toast(msg) {
    document.dispatchEvent(new CustomEvent("os:toast", { detail: msg }));
  }

  /* ---------- the slider you are allowed to move, briefly ---------- */

  function userOverride(fraction) {
    overrideValue = MIN + clamp01(fraction) * (MAX - MIN);
    overrideUntil = Date.now() + OVERRIDE_MS;
    render();
    if (RESPECT_USER) return;
    clearTimeout(userOverride._t);
    userOverride._t = setTimeout(() => {
      overrideValue = null;
      overrideUntil = 0;
      render();
      toast("Brightness is managed to match your battery.");
    }, OVERRIDE_MS);
  }

  /* ---------- the ambient decline ---------- */

  function startDrain() {
    clearInterval(drainTimer);
    drainTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (sweep) return;                 // a sweep is driving instead
      if (realBattery && realBattery.charging) return;
      setLevel(level - 0.01);
      if (level <= 0.02) clearInterval(drainTimer);
    }, IDLE_DRAIN_MS);
  }

  /* ---------- the demo sweep: tap the battery readout ---------- */

  function runSweep(target) {
    if (sweep) clearInterval(sweep.timer);
    const dir = target < level ? -1 : 1;
    sweep = { dir, target };
    toast(
      dir < 0
        ? "Battery falling. The screen will follow it down."
        : "Charging. The screen is permitted to brighten."
    );
    sweep.timer = setInterval(() => {
      const next = level + dir * 0.01;
      const done = dir < 0 ? next <= target : next >= target;
      setLevel(done ? target : next);
      if (done) {
        clearInterval(sweep.timer);
        sweep = null;
      }
    }, SWEEP_MS);
  }

  /* tap the percentage to demonstrate the coupling on demand */
  function toggleSweep() {
    if (sweep) {                       // interrupt a running sweep
      clearInterval(sweep.timer);
      sweep = null;
      return;
    }
    runSweep(level > 0.25 ? 0.05 : 1.0);
  }

  function init() {
    /* seed from the real battery where the browser exposes it, so the demo
       starts from something true */
    if (navigator.getBattery) {
      navigator
        .getBattery()
        .then((b) => {
          realBattery = b;
          setLevel(b.level);
          b.addEventListener("levelchange", () => {
            if (!sweep) setLevel(b.level, { announce: true });
          });
          b.addEventListener("chargingchange", () => render());
        })
        .catch(() => {});
    }

    render();
    startDrain();

    /* every battery readout is a demo trigger */
    document.querySelectorAll("[data-battery]").forEach((el) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", toggleSweep);
    });
  }

  return { init, userOverride, setLevel, toggleSweep, render };
})();
