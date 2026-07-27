/* oversmart-ai.js — the AI sheet made real.
   Tap the pill -> capture voice -> transcribe -> POST the transcript
   to /api/ask (which holds the secret key) -> stream the answer to
   screen and speak it aloud.

   Voice-in uses the Web Speech API; voice-out uses speech synthesis.
   Both are built into Chrome — no extra key, no extra service. */

const OversmartAI = (() => {
  const BAR_COUNT = 9;

  let audioCtx = null;
  let analyser = null;
  let micStream = null;
  let rafId = null;
  let recognition = null;
  let bars = [];
  let listening = false;
  let busy = false;

  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    $("ai-status").textContent = msg || "";
  }

  function buildBars() {
    const wrap = $("ai-waveform");
    wrap.innerHTML = "";
    bars = Array.from({ length: BAR_COUNT }, () => {
      const b = document.createElement("div");
      b.className = "ai-waveform__bar";
      wrap.appendChild(b);
      return b;
    });
  }

  function animate() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const step = Math.floor(data.length / BAR_COUNT);
    bars.forEach((bar, i) => {
      const v = data[i * step] / 255;
      bar.style.height = 8 + v * 52 + "px";
    });
    rafId = requestAnimationFrame(animate);
  }

  async function startMic() {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    buildBars();
    $("ai-waveform").classList.add("is-live");
    animate();
  }

  function stopMic() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    $("ai-waveform").classList.remove("is-live");
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

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      /* no speech API: type instead */
      const typed = prompt("Ask Oversmart AI:");
      if (typed && typed.trim()) submit(typed.trim());
      return;
    }

    recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    listening = true;
    $("ai-pill").classList.add("is-listening");
    $("ai-pill-label").textContent = "Listening…";
    setStatus("Speak now.");
    $("ai-you").textContent = "";
    $("ai-answer").textContent = "";

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      $("ai-you").textContent = transcript;
      if (e.results[e.results.length - 1].isFinal && transcript) {
        stopListening();
        submit(transcript);
      }
    };
    recognition.onerror = () => {
      stopListening();
      setStatus("Didn't catch that. Tap to try again.");
    };
    recognition.onend = () => {
      if (listening) stopListening();
    };

    startMic()
      .then(() => recognition.start())
      .catch(() => {
        stopListening();
        setStatus("Microphone unavailable.");
      });
  }

  function stopListening() {
    listening = false;
    $("ai-pill").classList.remove("is-listening");
    $("ai-pill-label").textContent = "Ask Oversmart AI";
    stopMic();
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
  }

  async function submit(text) {
    busy = true;
    $("ai-pill").classList.add("is-busy");
    setStatus("Oversmart AI is deciding what you meant…");

    const answerEl = $("ai-answer");
    answerEl.innerHTML = '<span class="cursor"></span>';

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text })
      });

      const data = await res.json();

      if (!res.ok) {
        answerEl.textContent =
          "Oversmart AI is briefly unavailable. " +
          (data && data.error ? "(" + data.error + ")" : "");
        setStatus("");
        return;
      }

      const answer = data.answer || "(no answer)";
      await typeOut(answerEl, answer);
      setStatus("");
      speak(answer);
    } catch (err) {
      answerEl.textContent =
        "Oversmart AI could not reach itself. Check the connection.";
      setStatus("");
    } finally {
      busy = false;
      $("ai-pill").classList.remove("is-busy");
    }
  }

  /* stream the answer character by character */
  function typeOut(el, text) {
    return new Promise((resolve) => {
      el.textContent = "";
      const cursor = document.createElement("span");
      cursor.className = "cursor";
      el.appendChild(cursor);
      let i = 0;
      const t = setInterval(() => {
        if (i >= text.length) {
          clearInterval(t);
          cursor.remove();
          resolve();
          return;
        }
        cursor.insertAdjacentText("beforebegin", text[i]);
        el.scrollTop = el.scrollHeight;
        i++;
      }, 16);
    });
  }

  /* speak the answer — the phone tells you, it doesn't show you a list */
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  }

  function reset() {
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    $("ai-you").textContent = "";
    $("ai-answer").textContent = "";
    setStatus("Tap to speak. Oversmart AI is listening for what you meant.");
  }

  function onPill() {
    if (busy) return;
    if (listening) {
      stopListening();
      setStatus("Tap to speak.");
      return;
    }
    listen();
  }

  return { onPill, reset };
})();
