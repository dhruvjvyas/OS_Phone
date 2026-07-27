/* unlock.js — "State your reason for unlocking your phone."
   Real microphone amplitude drives the waveform. Real speech
   recognition captures the reason. The dark pattern executes;
   it is not illustrated. */

const Unlock = (() => {
  const BAR_COUNT = 10;
  /* resting heights echo the Figma composition */
  const REST = [45, 20, 73, 45, 120, 164, 108, 73, 45, 20];

  let bars = [];
  let audioCtx = null;
  let analyser = null;
  let micStream = null;
  let rafId = null;
  let recognition = null;
  let onDone = null;
  let finished = false;

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

  async function startMic() {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    animate();
  }

  function startRecognition(hintEl) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;

    recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) hintEl.textContent = `“${transcript}”`;
      const isFinal = e.results[e.results.length - 1].isFinal;
      if (isFinal && transcript) finish(transcript);
    };
    recognition.onerror = () => showFallback();
    recognition.onend = () => {
      /* silence, or recognition gave up — offer the typed interrogation */
      if (!finished) showFallback();
    };
    recognition.start();
    return true;
  }

  function showFallback() {
    const fb = document.getElementById("reason-fallback");
    const hint = document.getElementById("reason-hint");
    if (fb.hidden) {
      fb.hidden = false;
      hint.textContent = "Voice unavailable. State your reason in writing.";
      document.getElementById("reason-input").focus();
    }
  }

  function finish(reason) {
    if (finished) return;
    finished = true;
    stop();
    if (onDone) onDone(reason);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

  async function begin(doneCallback) {
    finished = false;
    onDone = doneCallback;
    const container = document.getElementById("waveform");
    const hint = document.getElementById("reason-hint");
    const fb = document.getElementById("reason-fallback");
    fb.hidden = true;
    hint.textContent = "Listening…";
    buildBars(container);

    /* typed fallback path */
    fb.onsubmit = (e) => {
      e.preventDefault();
      const val = document.getElementById("reason-input").value.trim();
      if (!val) return;
      document.getElementById("reason-input").value = "";
      finish(val);
    };

    try {
      await startMic();
      const speechOk = startRecognition(hint);
      if (!speechOk) {
        /* mic works but no speech API: any sustained sound unlocks */
        hint.textContent = "Speak. The content will be inferred.";
        let loudFrames = 0;
        const check = setInterval(() => {
          if (!analyser) return clearInterval(check);
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
    } catch {
      showFallback();
    }
  }

  return { begin, cancel: stop };
})();
