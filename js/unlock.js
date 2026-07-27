/* unlock.js — "State your reason for unlocking your phone."
   Real microphone amplitude drives the waveform. Real speech
   recognition captures the reason. The dark pattern executes;
   it is not illustrated.

   Why this file is shaped the way it is (three real browser constraints):

   1. USER-GESTURE CHAIN. SpeechRecognition.start() must run inside the
      user activation from the tap that got us here. `await getUserMedia()`
      first would spend that activation and Chrome then rejects start()
      with `not-allowed`. So recognition starts SYNCHRONOUSLY, first;
      the waveform mic is opened afterwards.

   2. MIC CONTENTION. On Android Chrome, holding a getUserMedia stream open
      while SpeechRecognition runs can starve recognition (`audio-capture`
      / instant `no-speech`). If that happens we drop the waveform stream
      and keep the voice — the transcript is what matters.

   3. `no-speech` / `aborted` ARE NOT FAILURES. Chrome ends a recognition
      session after a short silence. Previously that flipped straight to
      the typed fallback, which is why voice appeared not to work at all:
      the fallback took over before the user had finished speaking. We now
      restart the session and only offer typing after a real grace period. */

const Unlock = (() => {
  const BAR_COUNT = 10;
  /* resting heights echo the Figma composition */
  const REST = [45, 20, 73, 45, 120, 164, 108, 73, 45, 20];

  /* how long we let the interrogation run before offering the typed way out */
  const FALLBACK_GRACE_MS = 12000;
  const MAX_RESTARTS = 8;

  let bars = [];
  let audioCtx = null;
  let analyser = null;
  let micStream = null;
  let rafId = null;
  let recognition = null;
  let onDone = null;
  let finished = false;
  let restarts = 0;
  let graceTimer = null;
  let idleRaf = null;
  let heard = false;

  function buildBars(container) {
    container.innerHTML = "";
    bars = REST.map((h) => {
      const el = document.createElement("div");
      el.className = "waveform__bar";
      el.style.height = h * 0.35 + "px";
      container.appendChild(el);
      return el;
    });
  }

  function animate() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const step = Math.floor(data.length / BAR_COUNT);
    bars.forEach((bar, i) => {
      const v = data[i * step] / 255; // 0..1
      const h = 12 + v * REST[i];
      bar.style.height = h + "px";
    });
    rafId = requestAnimationFrame(animate);
  }

  /* When the waveform mic isn't available (or we had to release it so that
     recognition could breathe), the bars still need to look alive — the
     screen is listening, and it should read as listening. */
  function animateIdle() {
    const t0 = performance.now();
    const loop = (t) => {
      const dt = (t - t0) / 1000;
      bars.forEach((bar, i) => {
        const wave = Math.sin(dt * 2.2 + i * 0.7) * 0.5 + 0.5;
        bar.style.height = 10 + wave * REST[i] * 0.45 + "px";
      });
      idleRaf = requestAnimationFrame(loop);
    };
    idleRaf = requestAnimationFrame(loop);
  }

  function stopIdle() {
    if (idleRaf) cancelAnimationFrame(idleRaf);
    idleRaf = null;
  }

  function releaseMic() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;
  }

  /* The waveform mic is a nice-to-have. It is opened after recognition and
     released the moment it looks like it is costing us the transcript. */
  async function startMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("no getUserMedia");
    }
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    /* Safari/iOS hands back a suspended context outside a gesture */
    if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    stopIdle();
    animate();
  }

  function speechSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startRecognition(hintEl) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;

    recognition = new SR();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    /* continuous: do not let a breath end the interrogation */
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const shown = (final || interim).trim();
      if (shown) {
        heard = true;
        hintEl.textContent = `“${shown}”`;
      }
      if (final.trim()) finish(final.trim());
    };

    recognition.onerror = (e) => {
      const err = e && e.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        /* the only genuinely terminal case: permission was refused */
        hintEl.textContent =
          "Microphone access was denied. State your reason in writing.";
        showFallback(true);
        return;
      }
      if (err === "audio-capture") {
        /* something else holds the mic — most likely our own waveform
           stream. Give it up; the transcript matters more. */
        releaseMic();
        animateIdle();
      }
      /* no-speech / aborted / network: onend will restart us */
    };

    recognition.onend = () => {
      if (finished) return;
      if (restarts < MAX_RESTARTS) {
        restarts++;
        try {
          recognition.start();
          return;
        } catch {
          /* start() can throw if called too soon after end — retry shortly */
          setTimeout(() => {
            if (!finished && recognition) {
              try { recognition.start(); } catch {}
            }
          }, 250);
          return;
        }
      }
      showFallback();
    };

    try {
      recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  /* `hard` = voice is genuinely unavailable, so don't pretend otherwise */
  function showFallback(hard = false) {
    const fb = document.getElementById("reason-fallback");
    const hint = document.getElementById("reason-hint");
    const retry = document.getElementById("reason-retry");
    if (!fb.hidden) return;
    fb.hidden = false;
    if (!hard && !heard) {
      hint.textContent = "Nothing was heard. Speak again, or write it down.";
    } else if (!hard) {
      hint.textContent = "Finish out loud, or write it down.";
    }
    /* offer a way back to voice unless it's permanently unavailable */
    if (retry) retry.hidden = hard || !speechSupported();
    document.getElementById("reason-input").focus({ preventScroll: true });
  }

  function finish(reason) {
    if (finished) return;
    finished = true;
    stop();
    if (onDone) onDone(reason);
  }

  function stop() {
    clearTimeout(graceTimer);
    graceTimer = null;
    stopIdle();
    releaseMic();
    if (recognition) {
      recognition.onend = null; // don't let the restart loop resurrect it
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.stop(); } catch {}
      recognition = null;
    }
  }

  /* Called synchronously from the unlock tap, so the user activation is
     still live when recognition.start() runs. */
  function begin(doneCallback) {
    finished = false;
    heard = false;
    restarts = 0;
    onDone = doneCallback;

    const container = document.getElementById("waveform");
    const hint = document.getElementById("reason-hint");
    const fb = document.getElementById("reason-fallback");
    const retry = document.getElementById("reason-retry");
    fb.hidden = true;
    if (retry) retry.hidden = true;
    hint.textContent = "Listening…";
    buildBars(container);
    animateIdle();

    /* typed fallback path */
    fb.onsubmit = (e) => {
      e.preventDefault();
      const val = document.getElementById("reason-input").value.trim();
      if (!val) return;
      document.getElementById("reason-input").value = "";
      finish(val);
    };

    /* "Try speaking again" — a fresh gesture, so a fresh permission chance */
    if (retry) {
      retry.onclick = () => {
        if (finished) return;
        restarts = 0;
        fb.hidden = true;
        retry.hidden = true;
        hint.textContent = "Listening…";
        stop();
        finished = false;
        armGrace();
        startVoice(hint);
      };
    }

    /* A secure context is required for both APIs. file:// and plain http
       on a LAN IP silently fail — say so instead of blaming the user. */
    if (!window.isSecureContext) {
      hint.textContent =
        "Voice needs a secure connection (https). State your reason in writing.";
      showFallback(true);
      return;
    }

    if (!speechSupported()) {
      /* no Web Speech API (Firefox, most iOS browsers): fall back to
         "any sustained sound unlocks" so the mechanic still executes */
      hint.textContent = "Speak. The content will be inferred.";
      startMic()
        .then(() => listenForSound())
        .catch(() => showFallback(true));
      armGrace();
      return;
    }

    armGrace();
    startVoice(hint);
  }

  /* recognition FIRST (inside the gesture), waveform mic after */
  function startVoice(hint) {
    const ok = startRecognition(hint);
    if (!ok) {
      showFallback(true);
      return;
    }
    /* Open the waveform mic a beat later so recognition has claimed the
       input first. If it fails, the idle animation carries the screen. */
    setTimeout(() => {
      if (finished || !recognition) return;
      startMic().catch(() => {
        /* no waveform — keep the idle bars, keep listening */
      });
    }, 350);
  }

  function listenForSound() {
    let loudFrames = 0;
    const check = setInterval(() => {
      if (finished || !analyser) return clearInterval(check);
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      loudFrames = avg > 28 ? loudFrames + 1 : 0;
      if (loudFrames > 6) {
        clearInterval(check);
        finish("(spoken — content inferred)");
      }
    }, 200);
  }

  function armGrace() {
    clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      if (!finished) showFallback();
    }, FALLBACK_GRACE_MS);
  }

  return { begin, cancel: stop };
})();
