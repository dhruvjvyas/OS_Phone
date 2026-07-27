/* oversmart-ai.js — the AI sheet made real.
   Tap the pill -> capture voice -> transcribe -> POST the transcript
   to /api/ask (which holds the secret key) -> stream the answer to
   screen and speak it aloud.

   Voice-in uses the Web Speech API; voice-out uses speech synthesis.
   Both are built into Chrome — no extra key, no extra service. */

/* ---------------------------------------------------------------
   AUTOCOMPLETE — "the phone thinks it knows what you want to say"

   The dark pattern executes rather than being illustrated: the moment
   you type a character, Oversmart AI finishes the sentence for you in
   dim text. Accept it with Tab / → / the button. Press Enter while a
   suggestion is showing and it submits ITS sentence, not yours — the
   phone assumes, and tells you so afterwards.
   --------------------------------------------------------------- */
const Autocomplete = (() => {
  /* Every completion is something the phone would rather you were asking:
     more self-doubt, more dependence, more time on the device. */
  const SENTENCES = [
    "how do i stop checking my phone every five minutes",
    "how much time did i spend on this today",
    "what is everyone else doing right now",
    "what did i miss while i was away",
    "why do i feel worse after using this",
    "why does everyone seem busier than me",
    "who has been trying to reach me",
    "when did i last go an hour without this",
    "where is everyone tonight",
    "should i be worried about what i just searched",
    "should i reply to that now or later",
    "is it normal to check this often",
    "is there anything i need to know",
    "can you just decide this for me",
    "can you tell me what i actually want",
    "i don't know what i'm looking for",
    "i think i just picked this up out of habit",
    "tell me something that will keep me here longer",
    "tell me i'm doing fine",
    "find me something to look at",
    "show me something new",
    "remind me why i picked this up",
    "do i really need to know this",
    "am i missing anything important",
    "make this decision for me",
    "help me stop doing this"
  ];

  /* If nothing matches, it still presumes — it just presumes generically. */
  const TAILS = [
    " and what that says about me",
    " before i change my mind",
    " so i don't have to think about it",
    " — actually, you decide"
  ];

  /* Returns the full sentence the phone has decided you're writing,
     or null if it has (briefly, uncharacteristically) no opinion. */
  function suggest(typed) {
    const t = typed.toLowerCase();
    if (t.trim().length < 1) return null;

    /* Once you've accepted a whole sentence, let it stand. Without this the
       generic tail below fires immediately after an accept and the
       suggestion looks like it never took. */
    if (SENTENCES.includes(t.trim())) return null;

    const hit = SENTENCES.find((s) => s.startsWith(t) && s.length > t.length);
    if (hit) return hit;

    /* no prefix match — wait for a whole word, then finish it anyway */
    if (/\s$/.test(typed) || typed.length >= 4) {
      const tail = TAILS[typed.trim().length % TAILS.length];
      const joiner = /\s$/.test(typed) ? "" : "";
      return typed + joiner + tail;
    }
    return null;
  }

  /* Preserve what the user actually typed (case and all), and append only
     the remainder — otherwise accepting a suggestion would rewrite their
     capitalisation, which reads as a bug rather than as presumption. */
  function completionFor(typed) {
    const full = suggest(typed);
    if (!full) return null;
    return { rest: full.slice(typed.length), full: typed + full.slice(typed.length) };
  }

  return { completionFor };
})();

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
      /* no speech API — typing is a first-class path now, so just say so */
      setStatus("Voice isn't available here. Type instead — it will finish your sentence.");
      $("ai-input").focus();
      return;
    }

    recognition = new SR();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    listening = true;
    $("ai-pill").classList.add("is-listening");
    $("ai-mic").classList.add("is-recording");
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
    recognition.onerror = (e) => {
      stopListening();
      setStatus(
        e && e.error === "not-allowed"
          ? "Microphone denied. Type instead."
          : "Didn't catch that. Tap the mic again, or type."
      );
    };
    recognition.onend = () => {
      if (listening) stopListening();
    };

    /* Recognition first (still inside the tap's user activation), mic after —
       same ordering constraint as the unlock screen. */
    try {
      recognition.start();
    } catch {
      stopListening();
      setStatus("Voice couldn't start. Type instead.");
      return;
    }
    startMic().catch(() => {
      /* no waveform; recognition may still be running */
    });
  }

  function stopListening() {
    listening = false;
    $("ai-pill").classList.remove("is-listening");
    $("ai-mic").classList.remove("is-recording");
    stopMic();
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
  }

  /* ---------------- typing: the phone finishes your sentence ------------- */

  /* True inline completion: the rest of the sentence is written INTO the
     field and left selected, so the next keystroke overwrites it. Nothing is
     offered — the words are simply already in your mouth. `autoFrom` marks
     where the phone's words begin, which is how we know whether you ever
     agreed to them. */
  let autoFrom = -1;

  function hasUnclaimedCompletion() {
    const input = $("ai-input");
    return autoFrom >= 0 && input.selectionStart !== input.selectionEnd;
  }

  function clearAuto() {
    autoFrom = -1;
    $("ai-accept").hidden = true;
  }

  function completeInline(deleting) {
    const input = $("ai-input");
    const typed = input.value;

    /* never fight a deletion — otherwise the sentence is unremovable, which
       is a bug, not a joke */
    if (deleting) { clearAuto(); return; }
    /* only presume from the end of the line */
    if (input.selectionStart !== typed.length) { clearAuto(); return; }

    const c = Autocomplete.completionFor(typed);
    if (!c || !c.rest) { clearAuto(); return; }

    input.value = c.full;
    /* select the part it decided on: keep typing and you overwrite it,
       press → or End and you've accepted it by omission */
    try {
      input.setSelectionRange(typed.length, c.full.length);
      autoFrom = typed.length;
      $("ai-accept").hidden = false;
    } catch {
      /* some soft keyboards refuse programmatic selection — the text is
         still in the box, which is the point */
      autoFrom = typed.length;
      $("ai-accept").hidden = false;
    }
  }

  function rejectCompletion() {
    const input = $("ai-input");
    if (autoFrom < 0) return;
    input.value = input.value.slice(0, autoFrom);
    input.setSelectionRange(input.value.length, input.value.length);
    clearAuto();
    setStatus("Removed. Oversmart AI will suggest it again.");
    input.focus();
  }

  function submitTyped() {
    const input = $("ai-input");
    const assumed = hasUnclaimedCompletion();
    const text = input.value.trim();
    if (!text) return;

    /* The admission has to live on the question, not in the status line —
       the request lifecycle overwrites the status a moment later, and this
       is the one line that shows the pattern executed. */
    const you = $("ai-you");
    you.textContent = text;
    if (assumed) {
      const note = document.createElement("span");
      note.className = "ai-you__note";
      note.textContent = "You were going to say that. Oversmart AI finished it.";
      you.appendChild(note);
    }

    input.value = "";
    clearAuto();
    input.blur();
    submit(text);
  }

  function bindTyping() {
    const input = $("ai-input");
    if (!input) return;

    let lastKeyWasDelete = false;

    input.addEventListener("input", (e) => {
      /* inputType is the reliable signal across soft keyboards; the keydown
         fallback covers browsers that omit it */
      const deleting = e.inputType
        ? e.inputType.startsWith("delete")
        : lastKeyWasDelete;
      lastKeyWasDelete = false;
      completeInline(deleting);
    });

    input.addEventListener("keydown", (e) => {
      lastKeyWasDelete = e.key === "Backspace" || e.key === "Delete";
      if (e.key === "Enter") {
        e.preventDefault();
        submitTyped();
      }
      /* Tab accepts by collapsing the selection — → and End already do this
         natively, so they need no handler */
      if (e.key === "Tab" && hasUnclaimedCompletion()) {
        e.preventDefault();
        input.setSelectionRange(input.value.length, input.value.length);
        clearAuto();
        setStatus("Completed for you.");
      }
    });

    /* tapping elsewhere in the field is not agreement, but it does end the
       selection — stop claiming the sentence is still "unclaimed" */
    input.addEventListener("click", () => {
      if (!hasUnclaimedCompletion()) clearAuto();
    });

    $("ai-accept").addEventListener("click", rejectCompletion);
    $("ai-send").addEventListener("click", submitTyped);
    $("ai-mic").addEventListener("click", onPill);
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
    const input = $("ai-input");
    if (input) {
      input.value = "";
      clearAuto();
    }
    setStatus("Speak, or type — Oversmart AI already knows how it ends.");
  }

  function onPill() {
    if (busy) return;
    if (listening) {
      stopListening();
      setStatus("Speak, or type.");
      return;
    }
    listen();
  }

  bindTyping();

  return { onPill, reset };
})();
