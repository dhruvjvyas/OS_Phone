# The Oversmart Phone — prototype shell

An anti-design provocation on how phones work. And what they could end up becoming.

This is the v1 shell: **Lock → State Your Reason → Home**, built as a fullscreen PWA. The dark patterns execute — they are not illustrated. The mins-since-checked clock runs off a real timestamp, the microphone waveform is driven by real amplitude, the spoken reason is really transcribed and really logged.

## What already works

| Mechanic | Implementation |
|---|---|
| Mins-since-you-last-checked clock | Real. `localStorage` timestamp set every time the app is hidden (screen off / app switch). Lock and Home both display it. |
| Written-out time ("Fifteen thirty-four") | `js/timewords.js`, updates every 5s, shown on lock clock and home status bar. |
| State your reason to unlock | Real mic via `getUserMedia`, waveform bars driven by an `AnalyserNode`, transcription via Web Speech API (Android Chrome). Typed fallback if voice is unavailable — which is its own friction. |
| The dossier | Every unlock stores `{reason, timestamp}`. Toast confirms: "Reason recorded. Pickup N today." |
| Re-lock on put-down | `visibilitychange` → phone considered put down → next pickup restarts the interrogation. The loop is the artifact. |
| Masked notification pill | "You may have notifications" → "Unlock to find out." |
| Real battery % | Battery API where available; falls back to the static 75%. |
| Offline + fullscreen | Service worker caches the shell; manifest requests `display: fullscreen`. |
| Notification shade | Pull down from top-left (or tap the pill). "You might have a new notification" — nothing resolves. Header shows **real** minutes of usage today. |
| Quick settings | Pull down from top-right. Tile grid + two vertical sliders; the brightness slider **really dims the OS** (CSS `brightness()` filter on `body`) — this is the mount point for brightness-by-battery. |
| App drawer as feed | Swipe up on Home. Apps rendered as social posts: hero, like, trash, open-arrow, "Last checked Xm ago" (live once opened this session). Trash: "cannot be uninstalled at this time." |
| Oversmart AI sheet | Center dock button or the search bar → dissolve overlay with the "Ask Oversmart AI" pill. |

## Gesture map (mirrors the Figma prototype wiring)

- **Pull down, top-left** → notification shade
- **Pull down, top-right** → quick settings
- **Swipe up on Home** → app drawer feed (gesture only — there is no tap target. The drag may *start on a dock button*: buttons are no longer excluded from gesture tracking, and the click that would otherwise fire is swallowed after a committed drag)
- **Vertical drag on any open overlay** → close (Esc also works on desktop)
- **Tap "You may have notifications"** → notification shade
- **Center dock button / search bar** → Oversmart AI sheet

## Wallpaper & the mark

`assets/wallpaper.jpg` (the Ama Dablam photo) and `assets/osp-logo.svg` are both in place. Every swipe-in surface — app drawer, notification shade, quick settings — is frosted glass over that wallpaper: `backdrop-filter: blur() saturate()` plus a scrim, tuned from four tokens at the top of `style.css` (`--glass-blur`, `--glass-fill`, `--glass-scrim`, `--glass-edge`). Panel fills are deliberately kept high enough that the dark type on the notification pills and app cards stays legible against the dark half of the photo.

`osp-logo.svg` is the real mark and carries its own colours — `#000033` field, `#FFFFCC` spiral — so it's dropped in as `<img>` and never tinted. It appears in three places: the home search pill, the centre dock button, and the Ask Oversmart AI pill. The same two colours are exposed as `--osp-navy` / `--osp-cream` for anything else that needs them.

## Voice on the reason screen

Speech capture is the one mechanic most likely to look broken, so the flow is defensive about three real browser constraints (all commented in `js/unlock.js`):

1. **The gesture chain.** `SpeechRecognition.start()` now runs *synchronously* inside the tap that opens the screen. Previously `await getUserMedia()` ran first, which spends the user activation — Chrome then rejects `start()` with `not-allowed`, and voice silently never began. The waveform mic is opened ~350ms *after* recognition instead.
2. **Mic contention.** Holding a `getUserMedia` stream open while recognition runs can starve it on Android Chrome. On `audio-capture` the waveform stream is released and recognition keeps going — the transcript matters more than the bars. The bars fall back to an idle animation so the screen still reads as listening.
3. **`no-speech` is not a failure.** Chrome ends a session after a short silence. That used to flip straight to the typed fallback, which is why voice appeared dead — the fallback took over before you'd finished speaking. Sessions now restart (up to 8×) and typing is only offered after a 12s grace period, alongside a **Try speaking again** button (a fresh tap = a fresh gesture = a fresh shot at the mic).

Only a genuine permission refusal is treated as terminal. An insecure origin is now named explicitly rather than blamed on the user — see the secure-context note under *Run locally*.

## Font

Google Sans isn't freely licensable, so the shell loads **Figtree** from Google Fonts (closest open match to the Figma register). If you have Google Sans files, add an `@font-face` in `css/style.css` and put `"Google Sans"` first in `--font-os` — the stack already lists it.

## Run locally

```bash
cd oversmart
python3 -m http.server 8080
# open http://localhost:8080 in Chrome
```

Mic + speech recognition require a **secure context**: `localhost` counts, plain LAN IPs don't. For phone testing, deploy first (below) or use `chrome://flags/#unsafely-treat-insecure-origin-as-secure` during dev.

## Deploy + install on the test phone

**GitHub Pages:** push this folder to a repo → Settings → Pages → deploy from branch. HTTPS by default.

**Vercel:** `npx vercel` from this folder. No build step needed — it's static.

Then on the second Android phone, open the URL in Chrome → menu → **Add to Home screen** → launch from the icon. `display: fullscreen` removes all browser chrome; it reads as an OS.

## Where the remaining features plug in

- **Notification-about-notification loop** → `sw.js` already handles `notificationclick` (opens the app → which is locked → which demands a reason). Schedule local notifications from `app.js` via `registration.showNotification()` after requesting permission from the notif pill.
- **Exit friction / closing apps** → dock buttons in `app.js` are stubs; each "app" becomes a screen whose close flow costs more than its open flow.
- **Honest toggles (détournement)** → build as a Settings screen; it's copy-driven, so it's cheap to add.
- **Brightness-by-battery** → CSS `filter: brightness()` on the root, driven by the Battery API level.
- **Home screen re-arrangement "for efficiency"** → shuffle dock/app-grid order on an interval; announce it with a toast.
- **Oversmart AI search** → `ai-search` stub; wire to whatever the AI-Overviews-anchored version of the feature becomes.
- **Record all calls / autocomplete** → fake app surfaces inside the shell.

## Structure

```
oversmart/
├── index.html            three screens in one document
├── css/style.css         the deadpan skin (design tokens up top)
├── js/
│   ├── app.js            state machine, clocks, put-down detection
│   ├── unlock.js         mic + speech interrogation
│   ├── store.js          the dossier (localStorage)
│   └── timewords.js      digits → words
├── sw.js                 offline shell + notification plumbing
├── manifest.webmanifest  fullscreen install
└── assets/               icons; add wallpaper.jpg here
```
