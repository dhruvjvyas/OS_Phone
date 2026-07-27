/* overlays.js — the shades, the drawer, the AI sheet.
   Gesture map mirrors the Figma prototype wiring:
     top-left drag down  -> notification shade   (MOVE_IN)
     top-right drag down -> quick settings       (MOVE_IN)
     home swipe up       -> app drawer (feed)    (MOVE_IN)
     tap notif pill      -> notification shade   (DISSOLVE)
     center dock / search-> Oversmart AI sheet   (DISSOLVE)
     drag on any overlay -> close                (CLOSE)   */

const Overlays = (() => {
  const els = {
    notifs: document.getElementById("overlay-notifs"),
    tools: document.getElementById("overlay-tools"),
    drawer: document.getElementById("overlay-drawer"),
    ai: document.getElementById("overlay-ai")
  };

  let openName = null;

  function open(name) {
    if (openName) els[openName].classList.remove("is-open");
    els[name].classList.add("is-open");
    openName = name;
    document.dispatchEvent(new CustomEvent("overlay:open", { detail: name }));
  }

  function close() {
    if (!openName) return;
    els[openName].classList.remove("is-open");
    openName = null;
  }

  function isOpen() {
    return openName !== null;
  }

  /* ---------------- gesture detection ---------------- */

  const TOP_ZONE = 100;    // px from top — the invisible squares in Figma
  const THRESHOLD = 60;    // px of drag before an intent is committed

  let start = null;
  let committed = false;

  document.addEventListener(
    "pointerdown",
    (e) => {
      committed = false;
      /* ignore drags that begin on interactive controls or scrollable feed */
      if (e.target.closest("button, input, a, .drawer__feed, .vslider")) {
        start = null;
        return;
      }
      start = { x: e.clientX, y: e.clientY };
    },
    { passive: true }
  );

  /* commit mid-drag: on touch, pointerup is unreliable because the
     browser may claim the gesture — so act the moment the threshold
     is crossed */
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!start || committed) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dy) < THRESHOLD || Math.abs(dx) > Math.abs(dy)) return;

      committed = true;
      const fromTop = start.y <= TOP_ZONE;
      const fromLeft = start.x < window.innerWidth / 2;

      /* an overlay is open: any committed vertical drag closes it */
      if (isOpen()) {
        close();
        return;
      }

      /* pull down from the top squares */
      if (dy > 0 && fromTop) {
        open(fromLeft ? "notifs" : "tools");
        return;
      }

      /* swipe up on the home screen opens the drawer */
      const homeActive = document
        .getElementById("screen-home")
        .classList.contains("is-active");
      if (dy < 0 && homeActive && start.y > window.innerHeight * 0.4) {
        open("drawer");
      }
    },
    { passive: true }
  );

  ["pointerup", "pointercancel"].forEach((evt) =>
    document.addEventListener(
      evt,
      () => {
        start = null;
        committed = false;
      },
      { passive: true }
    )
  );

  /* Escape closes overlays (desktop dev nicety) */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  /* ---------------- quick settings behavior ---------------- */

  document.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      tile.classList.toggle("is-on");
      if (tile.dataset.tile === "vibrate" && navigator.vibrate) {
        navigator.vibrate(tile.classList.contains("is-on") ? 40 : 0);
      }
    });
  });

  /* vertical sliders: brightness one really dims the OS.
     This is also the mount point for the brightness-by-battery feature. */
  document.querySelectorAll(".vslider").forEach((slider) => {
    const fill = slider.querySelector(".vslider__fill");
    let dragging = false;

    function setFromEvent(e) {
      const rect = slider.getBoundingClientRect();
      const pct = Math.min(
        1,
        Math.max(0.08, (rect.bottom - e.clientY) / rect.height)
      );
      fill.style.height = pct * 100 + "%";
      if (slider.dataset.slider === "brightness") {
        /* dim the whole surface: 0.35..1.0 */
        document.body.style.filter = `brightness(${0.35 + pct * 0.65})`;
      }
    }

    slider.addEventListener("pointerdown", (e) => {
      dragging = true;
      slider.setPointerCapture(e.pointerId);
      setFromEvent(e);
    });
    slider.addEventListener("pointermove", (e) => {
      if (dragging) setFromEvent(e);
    });
    slider.addEventListener("pointerup", () => (dragging = false));
  });

  /* ---------------- app drawer: apps as a feed ---------------- */

  const APPS = [
    {
      id: "instagram",
      name: "Instagram",
      heroBg: "#ffffff",
      heroColor: "#1a1a1a",
      icon:
        '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="16.6" cy="7.4" r="1" fill="currentColor"/></svg>',
      seedAgo: 7 * 60 * 1000
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      heroBg: "#25d366",
      heroColor: "#ffffff",
      icon:
        '<svg viewBox="0 0 24 24"><path d="M12 4.5a7.5 7.5 0 0 0-6.4 11.4L4.5 19.5l3.8-1A7.5 7.5 0 1 0 12 4.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
      seedAgo: 2 * 60 * 60 * 1000
    },
    {
      id: "spotify",
      name: "Spotify",
      heroBg: "#191414",
      heroColor: "#ffffff",
      icon:
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8.5 9.8c2.6-.8 5-.6 7 .6M9 12.4c2-.6 3.9-.4 5.6.5M9.6 15c1.5-.4 2.9-.3 4.2.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
      seedAgo: 8 * 60 * 60 * 1000
    }
  ];

  function agoLabel(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "Last checked just now";
    if (m < 60) return `Last checked ${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Last checked ${h}h ago`;
    return `Last checked ${Math.floor(h / 24)}d ago`;
  }

  const lastOpened = {}; // id -> epoch ms (session memory; seeds stand in)

  function renderFeed() {
    const feed = document.getElementById("drawer-feed");
    feed.innerHTML = "";
    APPS.forEach((app) => {
      const ago = lastOpened[app.id]
        ? Date.now() - lastOpened[app.id]
        : app.seedAgo;
      const card = document.createElement("article");
      card.className = "appcard";
      card.innerHTML = `
        <div class="appcard__hero" style="background:${app.heroBg};color:${app.heroColor}">${app.icon}</div>
        <div class="appcard__actions">
          <div class="appcard__actions-left">
            <button data-act="like" aria-label="Like ${app.name}">
              <svg viewBox="0 0 24 24"><path d="M12 19s-6.5-4.2-6.5-8.6A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 6.5 2.4C18.5 14.8 12 19 12 19Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            </button>
            <button data-act="trash" aria-label="Uninstall ${app.name}">
              <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7M10.5 10.5v5M13.5 10.5v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <button data-act="open" aria-label="Open ${app.name}">
            <svg viewBox="0 0 24 24"><path d="M8 16 16 8M9.5 8H16v6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div>
          <p class="appcard__name">${app.name}</p>
          <p class="appcard__meta">${agoLabel(ago)}</p>
        </div>`;

      card.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "open") {
          lastOpened[app.id] = Date.now();
          document.dispatchEvent(
            new CustomEvent("app:open", { detail: app })
          );
        } else if (act === "like") {
          document.dispatchEvent(
            new CustomEvent("app:like", { detail: app })
          );
        } else if (act === "trash") {
          document.dispatchEvent(
            new CustomEvent("app:trash", { detail: app })
          );
        }
      });
      feed.appendChild(card);
    });
  }

  document.addEventListener("overlay:open", (e) => {
    if (e.detail === "drawer") renderFeed();
    if (e.detail === "ai" && window.OversmartAI) OversmartAI.reset();
  });

  return { open, close, isOpen };
})();
