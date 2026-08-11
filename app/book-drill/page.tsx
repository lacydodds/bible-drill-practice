"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bibleBooks } from "@/data/books";

type AppSpeechAlternative = {
  transcript: string;
  confidence: number;
};

type AppSpeechResult = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: AppSpeechAlternative;
};

type AppSpeechResultList = {
  readonly length: number;
  [index: number]: AppSpeechResult;
};

type AppSpeechEvent = {
  results: AppSpeechResultList;
  resultIndex: number;
};

type AppSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: AppSpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
};

type AppSpeechRecognitionConstructor = new () => AppSpeechRecognition;

type SpeechWindow = {
  SpeechRecognition?: AppSpeechRecognitionConstructor;
  webkitSpeechRecognition?: AppSpeechRecognitionConstructor;
};

type Stage =
  | "idle"
  | "attention"
  | "present"
  | "showBook"
  | "countdown"
  | "timer"
  | "yesno"
  | "tryAgain"
  | "threeBooks"
  | "result";

type BookResult = {
  beforeCorrect: boolean;
  currentCorrect: boolean;
  afterCorrect: boolean;
  spoken: string;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWords(text: string): string[] {
  const normalized = normalize(text);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function appendNewSpeech(existing: string, incoming: string): string {
  const existingWords = normalizeWords(existing);
  const incomingWords = normalizeWords(incoming);

  if (incomingWords.length === 0) return existingWords.join(" ");
  if (existingWords.length === 0) return incomingWords.join(" ");

  let overlap = 0;
  const maxOverlap = Math.min(existingWords.length, incomingWords.length);

  for (let size = maxOverlap; size >= 1; size--) {
    const suffix = existingWords.slice(-size).join(" ");
    const prefix = incomingWords.slice(0, size).join(" ");
    if (suffix === prefix) {
      overlap = size;
      break;
    }
  }

  return [...existingWords, ...incomingWords.slice(overlap)].join(" ");
}

function bookMatches(spoken: string, correct: string): boolean {
  const normalizedSpoken = normalize(spoken);
  const normalizedCorrect = normalize(correct);

  if (normalizedSpoken.includes(normalizedCorrect)) {
    return true;
  }

  const aliases: Record<string, string[]> = {
    "1 samuel": ["first samuel", "one samuel", "1st samuel"],
    "2 samuel": ["second samuel", "two samuel", "2nd samuel"],
    "1 kings": ["first kings", "one kings", "1st kings"],
    "2 kings": ["second kings", "two kings", "2nd kings"],
    "1 chronicles": ["first chronicles", "one chronicles", "1st chronicles"],
    "2 chronicles": ["second chronicles", "two chronicles", "2nd chronicles"],
    "1 corinthians": ["first corinthians", "one corinthians", "1st corinthians"],
    "2 corinthians": ["second corinthians", "two corinthians", "2nd corinthians"],
    "1 thessalonians": ["first thessalonians", "one thessalonians", "1st thessalonians"],
    "2 thessalonians": ["second thessalonians", "two thessalonians", "2nd thessalonians"],
    "1 timothy": ["first timothy", "one timothy", "1st timothy"],
    "2 timothy": ["second timothy", "two timothy", "2nd timothy"],
    "1 peter": ["first peter", "one peter", "1st peter"],
    "2 peter": ["second peter", "two peter", "2nd peter"],
    "1 john": ["first john", "one john", "1st john"],
    "2 john": ["second john", "two john", "2nd john"],
    "3 john": ["third john", "three john", "3rd john"],
  };

  return (aliases[normalizedCorrect] ?? []).some((alias) =>
    normalizedSpoken.includes(normalize(alias))
  );
}

function playDing() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch {
    // Ignore audio errors.
  }
}

export default function BookDrillPage() {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("idle");
  const [currentBookIndex, setCurrentBookIndex] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timer, setTimer] = useState<number | null>(null);
  const [spokenText, setSpokenText] = useState("");
  const [bookResult, setBookResult] = useState<BookResult | null>(null);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<AppSpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const currentBookIndexRef = useRef<number | null>(null);
  const yesNoHandledRef = useRef(false);
  const yesNoListeningRef = useRef(false);
  const yesNoCanRespondRef = useRef(false);
  const threeBookListeningRef = useRef(false);
  const speechSessionRef = useRef(0);
  const stageRef = useRef<Stage>("idle");

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    currentBookIndexRef.current = currentBookIndex;
  }, [currentBookIndex]);

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopRecognition();
    };
  }, []);

  function getSpeechRecognition() {
    const speechWindow = window as unknown as SpeechWindow;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  }

  function clearAllTimers() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function stopRecognition() {
    yesNoListeningRef.current = false;
    threeBookListeningRef.current = false;
    speechSessionRef.current++;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors.
      }
    }

    setListening(false);
  }

  function getDisplayedTranscript() {
    return [finalTranscriptRef.current.trim(), interimTranscriptRef.current.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function processSpeechEvent(event: AppSpeechEvent) {
    let finalText = finalTranscriptRef.current;
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript?.trim() || "";
      if (!transcript) continue;

      if (result.isFinal) {
        finalText = appendNewSpeech(finalText, transcript);
        finalTranscriptRef.current = finalText;
      } else {
        interimText = appendNewSpeech(interimText, transcript);
      }
    }

    interimTranscriptRef.current = interimText;
    const displayed = getDisplayedTranscript();
    setSpokenText(displayed);
    return displayed;
  }

  function handleYesNoTranscript(transcript: string) {
    if (!yesNoCanRespondRef.current || yesNoHandledRef.current) return;

    const words = normalize(transcript).split(" ").filter(Boolean);

    if (words.includes("yes")) {
      yesNoHandledRef.current = true;
      yesNoListeningRef.current = false;
      speechSessionRef.current++;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onend = null;
        recognition.onerror = null;
        try {
          recognition.stop();
        } catch {
          // Ignore stop errors.
        }
      }

      setListening(false);
      setSpokenText("Yes — great! Now answer the three books.");

      phaseTimerRef.current = setTimeout(() => {
        beginThreeBookListening();
      }, 700);
      return;
    }

    if (words.includes("no")) {
      yesNoHandledRef.current = true;
      yesNoListeningRef.current = false;
      speechSessionRef.current++;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onend = null;
        recognition.onerror = null;
        try {
          recognition.stop();
        } catch {
          // Ignore stop errors.
        }
      }

      setListening(false);
      setStage("tryAgain");
      stageRef.current = "tryAgain";
      setSpokenText("");

      phaseTimerRef.current = setTimeout(() => {
        const sameBook = currentBookIndexRef.current;
        startSequence(sameBook ?? undefined);
      }, 2000);
    }
  }

  function startYesNoRecognitionInstance(sessionId: number) {
    if (!yesNoListeningRef.current || sessionId !== speechSessionRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    setListening(true);

    recognition.onresult = (event) => {
      if (sessionId !== speechSessionRef.current) return;
      const displayed = processSpeechEvent(event);
      handleYesNoTranscript(displayed);
    };

    recognition.onend = () => {
      if (
        yesNoListeningRef.current &&
        !yesNoHandledRef.current &&
        sessionId === speechSessionRef.current
      ) {
        recognitionRef.current = null;
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          startYesNoRecognitionInstance(sessionId);
        }, 150);
      } else {
        setListening(false);
      }
    };

    recognition.onerror = () => {
      // onend handles the restart while we still want to listen.
    };

    try {
      recognition.start();
    } catch {
      // Ignore duplicate-start errors.
    }
  }

  function startYesNoListening() {
    if (yesNoListeningRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Try Google Chrome.");
      return;
    }

    stopRecognition();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    yesNoHandledRef.current = false;
    yesNoListeningRef.current = true;
    yesNoCanRespondRef.current = false;
    setSpokenText("");

    speechSessionRef.current++;
    startYesNoRecognitionInstance(speechSessionRef.current);
  }

  function stopYesNoListening() {
    yesNoHandledRef.current = true;
    yesNoListeningRef.current = false;
    stopRecognition();
    setSpokenText("Listening stopped. Please try again.");
  }

  function startThreeBookRecognitionInstance(sessionId: number) {
    if (!threeBookListeningRef.current || sessionId !== speechSessionRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    setListening(true);

    recognition.onresult = (event) => {
      if (sessionId !== speechSessionRef.current) return;
      processSpeechEvent(event);
    };

    recognition.onend = () => {
      if (threeBookListeningRef.current && sessionId === speechSessionRef.current) {
        recognitionRef.current = null;
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          startThreeBookRecognitionInstance(sessionId);
        }, 150);
      } else {
        setListening(false);
      }
    };

    recognition.onerror = () => {
      // onend handles the restart while we still want to listen.
    };

    try {
      recognition.start();
    } catch {
      // Ignore duplicate-start errors.
    }
  }

  function beginThreeBookListening() {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Try Google Chrome.");
      return;
    }

    stopRecognition();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setSpokenText("");

    threeBookListeningRef.current = true;
    setStage("threeBooks");
    stageRef.current = "threeBooks";

    speechSessionRef.current++;
    startThreeBookRecognitionInstance(speechSessionRef.current);
  }

  function stopThreeBookListening() {
    const spoken = getDisplayedTranscript();
    threeBookListeningRef.current = false;
    stopRecognition();
    judgeThreeBooks(spoken);
  }

  function judgeThreeBooks(spokenOverride?: string) {
    const spoken = (spokenOverride ?? getDisplayedTranscript()).trim();
    const index = currentBookIndexRef.current;

    if (index === null || index < 0 || index >= bibleBooks.length) return;

    const before = index > 0 ? bibleBooks[index - 1] : null;
    const current = bibleBooks[index];
    const after = index < bibleBooks.length - 1 ? bibleBooks[index + 1] : null;

    setBookResult({
      beforeCorrect: before ? bookMatches(spoken, before) : false,
      currentCorrect: bookMatches(spoken, current),
      afterCorrect: after ? bookMatches(spoken, after) : false,
      spoken,
    });

    setStage("result");
    stageRef.current = "result";
  }

  function resetDrill() {
    clearAllTimers();
    stopRecognition();
    setStage("idle");
    stageRef.current = "idle";
    setCountdown(null);
    setTimer(null);
    setSpokenText("");
    setBookResult(null);
    setCurrentBookIndex(null);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    yesNoHandledRef.current = false;
    yesNoCanRespondRef.current = false;
  }

  function startSequence(bookIndex?: number) {
    clearAllTimers();
    stopRecognition();

    const index = bookIndex ?? Math.floor(Math.random() * bibleBooks.length);
    setCurrentBookIndex(index);
    currentBookIndexRef.current = index;
    setSpokenText("");
    setBookResult(null);
    setCountdown(null);
    setTimer(null);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    yesNoHandledRef.current = false;
    yesNoCanRespondRef.current = false;

    setStage("attention");
    stageRef.current = "attention";

    phaseTimerRef.current = setTimeout(() => {
      setStage("present");
      stageRef.current = "present";

      phaseTimerRef.current = setTimeout(() => {
        setStage("showBook");
        stageRef.current = "showBook";

        phaseTimerRef.current = setTimeout(() => {
          startCountdown();
        }, 2000);
      }, 2000);
    }, 2000);
  }

  function startCountdown() {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    let count = 3;
    setCountdown(count);
    setStage("countdown");
    stageRef.current = "countdown";

    countdownIntervalRef.current = setInterval(() => {
      count--;

      if (count > 0) {
        setCountdown(count);
        return;
      }

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      setCountdown(null);
      beginTenSecondTimer();
    }, 1000);
  }

  function beginTenSecondTimer() {
    if (timerRef.current) clearInterval(timerRef.current);

    let remaining = 10;
    setStage("timer");
    stageRef.current = "timer";
    setTimer(remaining);

    timerRef.current = setInterval(() => {
      remaining--;

      if (remaining > 0) {
        setTimer(remaining);

        // Pre-warm the microphone at 1 second so it is ready for Yes/No.
        if (remaining === 1 && !yesNoListeningRef.current) {
          startYesNoListening();
        }
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setTimer(0);
      timeUp();
    }, 1000);
  }

  function timeUp() {
    playDing();
    setStage("yesno");
    stageRef.current = "yesno";
    setTimer(null);
    yesNoCanRespondRef.current = true;

    if (!yesNoListeningRef.current) {
      startYesNoListening();
      yesNoCanRespondRef.current = true;
    }

    // Catch a Yes/No that was spoken just before the ding while the mic was pre-warmed.
    setTimeout(() => {
      handleYesNoTranscript(getDisplayedTranscript());
    }, 50);
  }

  function getBeforeBook() {
    if (currentBookIndex === null || currentBookIndex === 0) {
      return "There is no book before this one.";
    }
    return bibleBooks[currentBookIndex - 1];
  }

  function getAfterBook() {
    if (currentBookIndex === null || currentBookIndex === bibleBooks.length - 1) {
      return "There is no book after this one.";
    }
    return bibleBooks[currentBookIndex + 1];
  }

  const currentBook =
    currentBookIndex !== null ? bibleBooks[currentBookIndex] : "";

  return (
    <main className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-center text-3xl font-bold text-gray-900">📖 Bible Drill</h1>
        <p className="mt-2 text-center text-lg font-semibold text-gray-700">📚 Book Drill</p>

        <button
          onClick={() => router.push("/")}
          className="mt-4 w-full rounded-xl bg-gray-200 px-4 py-3 font-bold text-gray-900"
        >
          ← Back to Home
        </button>

        {stage === "idle" && (
          <div className="mt-8 text-center">
            <p className="text-lg text-gray-700">You will be given a random book of the Bible.</p>
            <p className="mt-3 text-lg text-gray-700">Find it in your Bible before the 10-second timer ends.</p>
            <button
              onClick={() => startSequence()}
              className="mt-8 w-full rounded-xl bg-blue-600 px-4 py-5 text-xl font-bold text-white"
            >
              ▶️ Start Book Drill
            </button>
          </div>
        )}

        {stage === "attention" && (
          <div className="mt-12 rounded-2xl bg-blue-50 p-10 text-center">
            <p className="text-5xl font-bold text-blue-700">ATTENTION</p>
          </div>
        )}

        {stage === "present" && (
          <div className="mt-12 rounded-2xl bg-green-50 p-10 text-center">
            <p className="text-5xl font-bold text-green-700">PRESENT BIBLES</p>
          </div>
        )}

        {stage === "showBook" && (
          <div className="mt-12 rounded-2xl bg-purple-50 p-10 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-600">Find This Book</p>
            <p className="mt-6 text-5xl font-bold text-purple-700">{currentBook}</p>
            <p className="mt-6 text-lg font-semibold text-gray-700">Get ready...</p>
          </div>
        )}

        {stage === "countdown" && (
          <div className="mt-12 rounded-2xl bg-blue-50 p-10 text-center">
            <p className="text-2xl font-bold text-gray-900">Get Ready!</p>
            <p className="mt-5 text-8xl font-bold text-blue-700">{countdown}</p>
          </div>
        )}

        {stage === "timer" && (
          <div className="mt-8 text-center">
            <div className="rounded-2xl bg-purple-50 p-8">
              <p className="text-sm font-bold uppercase tracking-wide text-gray-600">Find This Book</p>
              <p className="mt-4 text-5xl font-bold text-purple-700">{currentBook}</p>
              <p className="mt-8 text-7xl font-bold text-red-600">{timer}</p>
              <p className="mt-2 text-lg font-bold text-gray-700">seconds</p>
            </div>
          </div>
        )}

        {stage === "tryAgain" && (
          <div className="mt-12 rounded-2xl bg-orange-50 p-10 text-center">
            <p className="text-5xl font-bold text-orange-700">LET&apos;S TRY AGAIN!</p>
            <p className="mt-5 text-xl font-semibold text-gray-700">Keep looking for your book.</p>
          </div>
        )}

        {stage === "yesno" && (
          <div className="mt-8 text-center">
            <div className="rounded-2xl bg-yellow-50 p-7">
              <p className="text-4xl font-bold text-red-700">🔔 TIME UP!</p>
              <p className="mt-6 text-2xl font-bold text-gray-900">Did you get it?</p>
              <p className="mt-4 text-lg text-gray-700">Say <strong>&quot;Yes&quot;</strong> or <strong>&quot;No&quot;</strong>.</p>

              <div className={`mt-6 rounded-xl p-4 ${listening ? "bg-green-100" : "bg-white"}`}>
                <p className="font-semibold text-gray-700">
                  {listening ? "🎤 Microphone is listening..." : "Microphone is off"}
                </p>
                <p className="mt-2 min-h-7 text-lg text-gray-900">{spokenText || "Say Yes or No"}</p>
              </div>

              <button
                onClick={stopYesNoListening}
                disabled={!listening}
                className="mt-5 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                🛑 Stop Listening
              </button>

              <p className="mt-3 text-sm text-gray-600">The drill will automatically continue when it hears Yes or No.</p>
            </div>
          </div>
        )}

        {stage === "threeBooks" && (
          <div className="mt-8 text-center">
            <div className="rounded-2xl bg-blue-50 p-7">
              <p className="text-2xl font-bold text-gray-900">Please say:</p>
              <p className="mt-3 text-xl font-semibold text-blue-700">
                The book before,<br />the book called,<br />and the book after.
              </p>

              <div className="mt-6 rounded-xl bg-white p-4">
                <p className="font-semibold text-gray-700">{listening ? "🎤 What I hear:" : "Microphone is off"}</p>
                <p className="mt-2 min-h-12 text-lg text-gray-900">{spokenText || "Your answer will appear here..."}</p>
              </div>

              <button
                onClick={stopThreeBookListening}
                className="mt-6 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white"
              >
                🛑 Stop Listening
              </button>
            </div>
          </div>
        )}

        {stage === "result" && bookResult && (
          <div className="mt-8">
            <div
              className={`rounded-2xl p-7 text-center ${
                bookResult.beforeCorrect && bookResult.currentCorrect && bookResult.afterCorrect
                  ? "bg-green-50"
                  : "bg-yellow-50"
              }`}
            >
              <p className="text-3xl font-bold text-gray-900">
                {bookResult.beforeCorrect && bookResult.currentCorrect && bookResult.afterCorrect
                  ? "🎉 Great Job!"
                  : "📖 Let's Check Your Answer"}
              </p>

              <div className="mt-6 space-y-3 text-left">
                <p className={bookResult.beforeCorrect ? "text-green-700" : "text-red-700"}>
                  {bookResult.beforeCorrect ? "✅" : "❌"} Before: <strong>{getBeforeBook()}</strong>
                </p>
                <p className={bookResult.currentCorrect ? "text-green-700" : "text-red-700"}>
                  {bookResult.currentCorrect ? "✅" : "❌"} Called: <strong>{currentBook}</strong>
                </p>
                <p className={bookResult.afterCorrect ? "text-green-700" : "text-red-700"}>
                  {bookResult.afterCorrect ? "✅" : "❌"} After: <strong>{getAfterBook()}</strong>
                </p>
              </div>

              {bookResult.spoken && (
                <div className="mt-6 rounded-xl bg-white p-4">
                  <p className="font-semibold text-gray-700">The app heard:</p>
                  <p className="mt-2 text-gray-900">&quot;{bookResult.spoken}&quot;</p>
                </div>
              )}
            </div>

            <button
              onClick={() => startSequence()}
              className="mt-5 w-full rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white"
            >
              🔄 Try Another Book
            </button>

            <button
              onClick={resetDrill}
              className="mt-3 w-full rounded-xl bg-gray-200 px-4 py-3 font-bold text-gray-900"
            >
              ↩️ Back to Start
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
