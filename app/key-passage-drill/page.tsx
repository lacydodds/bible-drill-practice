"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { keyPassages } from "@/data/keyPassages";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Stage =
  | "select"
  | "idle"
  | "attention"
  | "present"
  | "passage"
  | "countdown"
  | "timer"
  | "yesno"
  | "retry"
  | "answer"
  | "result";

type PassageResult = {
  nameCorrect: boolean;
  referenceCorrect: boolean;
  spoken: string;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReference(text: string): string {
  return normalize(text)
    .replace(/\bto\b/g, " ")
    .replace(/\bthrough\b/g, " ")
    .replace(/\bchapter\b/g, " ")
    .replace(/\bchapters\b/g, " ")
    .replace(/\bverse\b/g, " ")
    .replace(/\bverses\b/g, " ")
    .replace(/\bcolon\b/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function passageNameMatches(
  spoken: string,
  correct: string
): boolean {
  const spokenNormalized = normalize(spoken);
  const correctNormalized = normalize(correct);

  if (spokenNormalized.includes(correctNormalized)) {
    return true;
  }

  const aliases: Record<string, string[]> = {
    "the creation": [
      "creation",
      "the creation story",
    ],
    "the israelites leave egypt": [
      "israelites leave egypt",
      "the israelites leaving egypt",
      "israel leaves egypt",
      "israelites leaving egypt",
    ],
    "a prayer for forgiveness": [
      "prayer for forgiveness",
      "prayer of forgiveness",
      "psalm fifty one",
      "psalm 51",
    ],
    "the baptism of jesus": [
      "baptism of jesus",
      "jesus baptism",
    ],
    "the model prayer": [
      "model prayer",
      "the lord's prayer",
      "lords prayer",
      "lord's prayer",
    ],
    "the great commandments": [
      "great commandments",
      "great commandment",
    ],
    "the birth of jesus": [
      "birth of jesus",
      "jesus birth",
    ],
    "the parable of the prodigal son": [
      "parable of the prodigal son",
      "prodigal son",
    ],
    "the comfort chapter": [
      "comfort chapter",
      "john fourteen",
      "john 14",
    ],
    "the christian's armor": [
      "christians armor",
      "christian armor",
      "armor of god",
      "armour of god",
    ],
  };

  const possibleAliases =
    aliases[correctNormalized] ?? [];

  return possibleAliases.some((alias) =>
    spokenNormalized.includes(normalize(alias))
  );
}

function referenceMatches(
  spoken: string,
  correct: string
): boolean {
  const spokenNormalized = normalizeReference(spoken);
  const correctNormalized = normalizeReference(correct);

  if (spokenNormalized.includes(correctNormalized)) {
    return true;
  }

  const aliases: Record<string, string[]> = {
    "genesis 1 2 3": [
      "genesis one two three",
      "genesis 1 2 3",
      "genesis one through two three",
    ],
    "exodus 12 37 42": [
      "exodus twelve thirty seven forty two",
      "exodus 12 37 42",
    ],
    "psalm 51": [
      "psalm fifty one",
      "psalms fifty one",
      "psalm 51",
      "psalms 51",
    ],
    "matthew 3 13 17": [
      "matthew three thirteen seventeen",
      "matthew 3 13 17",
    ],
    "matthew 6 5 15": [
      "matthew six five fifteen",
      "matthew 6 5 15",
    ],
    "mark 12 28 34": [
      "mark twelve twenty eight thirty four",
      "mark 12 28 34",
    ],
    "luke 2 1 7": [
      "luke two one seven",
      "luke 2 1 7",
    ],
    "luke 15 11 32": [
      "luke fifteen eleven thirty two",
      "luke 15 11 32",
    ],
    "john 14": [
      "john fourteen",
      "john 14",
    ],
    "ephesians 6 10 20": [
      "ephesians six ten twenty",
      "ephesians 6 10 20",
    ],
  };

  const possibleAliases =
    aliases[correctNormalized] ?? [];

  return possibleAliases.some((alias) =>
    spokenNormalized.includes(normalizeReference(alias))
  );
}

function playDing() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      880,
      context.currentTime
    );

    gain.gain.setValueAtTime(
      0.001,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.3,
      context.currentTime + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + 0.5
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch {
    // Ignore audio errors.
  }
}

export default function KeyPassageDrillPage() {
  const router = useRouter();

  const [stage, setStage] =
    useState<Stage>("select");

  const [selectedPassages, setSelectedPassages] =
    useState<number[]>(
      keyPassages.map((_, index) => index)
    );

  const [currentPassageIndex, setCurrentPassageIndex] =
    useState<number | null>(null);

  const [countdown, setCountdown] =
    useState<number | null>(null);

  const [timer, setTimer] =
    useState<number | null>(null);

  const [spokenText, setSpokenText] =
    useState("");

  const [result, setResult] =
    useState<PassageResult | null>(null);

  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);

  const timerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const phaseTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const countdownTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  // IMPORTANT:
  // Final speech is stored separately from interim speech.
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");

  const currentPassageIndexRef =
    useRef<number | null>(null);

  const yesNoHandledRef = useRef(false);
  const answerListeningRef = useRef(false);

  useEffect(() => {
    currentPassageIndexRef.current =
      currentPassageIndex;
  }, [currentPassageIndex]);

  useEffect(() => {
    return () => {
      clearTimers();
      stopRecognition();
    };
  }, []);

  function clearTimers() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }

  function stopRecognition() {
    answerListeningRef.current = false;
    yesNoHandledRef.current = true;

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
  }

  function goHome() {
    clearTimers();
    stopRecognition();
    router.push("/");
  }

  function togglePassage(index: number) {
    setSelectedPassages((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index]
    );
  }

  function selectAllPassages() {
    setSelectedPassages(
      keyPassages.map((_, index) => index)
    );
  }

  function clearAllPassages() {
    setSelectedPassages([]);
  }

  function startSelectedDrill() {
    if (selectedPassages.length === 0) {
      alert(
        "Please select at least one key passage."
      );
      return;
    }

    setStage("idle");
  }

  function resetDrill() {
    clearTimers();
    stopRecognition();

    setStage("select");
    setCountdown(null);
    setTimer(null);
    setSpokenText("");
    setResult(null);
    setCurrentPassageIndex(null);

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
  }

  function createRecognition(
    continuous: boolean
  ) {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Try Google Chrome."
      );

      return null;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    return recognition;
  }

  function updateTranscript(
    event: SpeechRecognitionEvent
  ) {
    let finalText = "";
    let interimText = "";

    for (
      let i = 0;
      i < event.results.length;
      i++
    ) {
      const result = event.results[i];

      if (result.isFinal) {
        finalText += result[0].transcript + " ";
      } else {
        interimText += result[0].transcript + " ";
      }
    }

    finalTranscriptRef.current =
      finalText.trim();

    interimTranscriptRef.current =
      interimText.trim();

    const combined =
      [
        finalTranscriptRef.current,
        interimTranscriptRef.current,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    setSpokenText(combined);

    return combined;
  }

  function beginYesNoListening() {
    stopRecognition();

    yesNoHandledRef.current = false;

    const recognition =
      createRecognition(true);

    if (!recognition) {
      setStage("answer");
      beginAnswerListening();
      return;
    }

    recognitionRef.current = recognition;

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    setSpokenText("");

    recognition.onresult = (
      event: SpeechRecognitionEvent
    ) => {
      const transcript =
        updateTranscript(event);

      const normalized =
        normalize(transcript);

      const words = normalized.split(" ");

      if (
        !yesNoHandledRef.current &&
        words.includes("yes")
      ) {
        yesNoHandledRef.current = true;

        stopRecognition();

        beginAnswerListening();
        return;
      }

      if (
        !yesNoHandledRef.current &&
        words.includes("no")
      ) {
        yesNoHandledRef.current = true;

        stopRecognition();

        retrySamePassage();
      }
    };

    recognition.onend = () => {
      if (
        !yesNoHandledRef.current &&
        stage === "yesno"
      ) {
        setTimeout(() => {
          if (!yesNoHandledRef.current) {
            beginYesNoListening();
          }
        }, 200);
      }
    };

    recognition.onerror = () => {
      if (!yesNoHandledRef.current) {
        setTimeout(() => {
          if (!yesNoHandledRef.current) {
            beginYesNoListening();
          }
        }, 300);
      }
    };

    try {
      recognition.start();
    } catch {
      // Ignore duplicate starts.
    }
  }

  function retrySamePassage() {
    clearTimers();
    stopRecognition();

    setSpokenText("No — Let's try again!");
    setStage("retry");

    phaseTimerRef.current =
      setTimeout(() => {
        const index =
          currentPassageIndexRef.current;

        if (index !== null) {
          startSequence(index);
        } else {
          startSequence();
        }
      }, 2500);
  }

  function beginAnswerListening() {
    stopRecognition();

    const recognition =
      createRecognition(true);

    if (!recognition) {
      setStage("result");
      return;
    }

    recognitionRef.current = recognition;

    answerListeningRef.current = true;

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    setSpokenText("");
    setStage("answer");

    recognition.onresult = (
      event: SpeechRecognitionEvent
    ) => {
      updateTranscript(event);
    };

    recognition.onend = () => {
      if (answerListeningRef.current) {
        setTimeout(() => {
          if (answerListeningRef.current) {
            try {
              recognition.start();
            } catch {
              // Ignore duplicate starts.
            }
          }
        }, 200);
      }
    };

    recognition.onerror = () => {
      if (answerListeningRef.current) {
        setTimeout(() => {
          if (answerListeningRef.current) {
            try {
              recognition.start();
            } catch {
              // Ignore duplicate starts.
            }
          }
        }, 300);
      }
    };

    try {
      recognition.start();
    } catch {
      // Ignore duplicate starts.
    }
  }

  function stopAnswerListening() {
    answerListeningRef.current = false;

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

    const spoken =
      finalTranscriptRef.current.trim();

    const index =
      currentPassageIndexRef.current;

    if (
      index === null ||
      index < 0 ||
      index >= keyPassages.length
    ) {
      return;
    }

    const passage = keyPassages[index];

    const nameCorrect =
      passageNameMatches(
        spoken,
        passage.name
      );

    const referenceCorrect =
      referenceMatches(
        spoken,
        passage.reference
      );

    setResult({
      nameCorrect,
      referenceCorrect,
      spoken,
    });

    setStage("result");
  }

  function startSequence(
    passageIndex?: number
  ) {
    clearTimers();
    stopRecognition();

    let index: number;

    if (passageIndex !== undefined) {
      index = passageIndex;
    } else {
      const randomPosition =
        Math.floor(
          Math.random() *
            selectedPassages.length
        );

      index =
        selectedPassages[randomPosition];
    }

    setCurrentPassageIndex(index);
    currentPassageIndexRef.current = index;

    setSpokenText("");
    setResult(null);
    setCountdown(null);
    setTimer(null);

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    yesNoHandledRef.current = false;

    setStage("attention");

    phaseTimerRef.current =
      setTimeout(() => {
        setStage("present");

        phaseTimerRef.current =
          setTimeout(() => {
            setStage("passage");

            phaseTimerRef.current =
              setTimeout(() => {
                startCountdown();
              }, 2000);
          }, 2000);
      }, 2000);
  }

  function startCountdown() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    let count = 3;

    setCountdown(count);
    setStage("countdown");

    countdownTimerRef.current =
      setInterval(() => {
        count--;

        if (count > 0) {
          setCountdown(count);
          return;
        }

        if (countdownTimerRef.current) {
          clearInterval(
            countdownTimerRef.current
          );

          countdownTimerRef.current = null;
        }

        setCountdown(null);

        beginTenSecondTimer();
      }, 1000);
  }

  function beginTenSecondTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    let remaining = 10;

    setStage("timer");
    setTimer(remaining);

    timerRef.current =
      setInterval(() => {
        remaining--;

        if (remaining > 0) {
          setTimer(remaining);
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
    setTimer(null);
    setSpokenText("");

    beginYesNoListening();
  }

  const currentPassage =
    currentPassageIndex !== null
      ? keyPassages[currentPassageIndex]
      : null;

  return (
    <main className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            📖 Bible Drill
          </h1>

          <p className="mt-1 text-lg font-semibold text-gray-700">
            📜 Key Passage Drill
          </p>
        </div>

        {stage === "select" && (
          <>
            <div className="mt-5 flex justify-start">
              <button
                onClick={goHome}
                className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-bold text-gray-900"
              >
                ← Home
              </button>
            </div>

            <h2 className="mt-4 text-center text-xl font-bold text-gray-900">
              Select Key Passages
            </h2>

            <p className="mt-2 text-center text-sm font-semibold text-gray-700">
              Selected:{" "}
              {selectedPassages.length} of{" "}
              {keyPassages.length}
            </p>

            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={selectAllPassages}
                className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white"
              >
                Select All
              </button>

              <button
                onClick={clearAllPassages}
                className="rounded-lg bg-gray-300 px-4 py-2 text-sm font-bold text-gray-900"
              >
                Clear All
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {keyPassages.map(
                (passage, index) => {
                  const selected =
                    selectedPassages.includes(index);

                  return (
                    <label
                      key={index}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                        selected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          togglePassage(index)
                        }
                        className="h-4 w-4 shrink-0"
                      />

                      <span className="text-sm font-medium leading-5 text-gray-900">
                        {passage.name}
                      </span>
                    </label>
                  );
                }
              )}
            </div>

            <button
              onClick={startSelectedDrill}
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-4 text-lg font-bold text-white"
            >
              ▶️ Start Key Passage Drill
            </button>
          </>
        )}

        {stage === "idle" && (
          <>
            <button
              onClick={resetDrill}
              className="mt-4 w-full rounded-xl bg-gray-200 px-4 py-3 font-bold text-gray-900"
            >
              ← Back to Select Key Passages
            </button>

            <div className="mt-8 text-center">
              <p className="text-lg text-gray-700">
                You will be given a key passage.
              </p>

              <p className="mt-3 text-lg text-gray-700">
                Find it in your Bible before
                the 10-second timer ends.
              </p>

              <p className="mt-3 text-sm font-semibold text-blue-700">
                {selectedPassages.length}{" "}
                passage
                {selectedPassages.length === 1
                  ? ""
                  : "s"} selected
              </p>

              <button
                onClick={() => startSequence()}
                className="mt-8 w-full rounded-xl bg-blue-600 px-4 py-5 text-xl font-bold text-white"
              >
                ▶️ Start Key Passage Drill
              </button>
            </div>
          </>
        )}

        {stage === "attention" && (
          <div className="mt-12 rounded-2xl bg-blue-50 p-10 text-center">
            <p className="text-5xl font-bold text-blue-700">
              ATTENTION
            </p>
          </div>
        )}

        {stage === "present" && (
          <div className="mt-12 rounded-2xl bg-green-50 p-10 text-center">
            <p className="text-5xl font-bold text-green-700">
              PRESENT BIBLES
            </p>
          </div>
        )}

        {stage === "passage" &&
          currentPassage && (
            <div className="mt-12 rounded-2xl bg-purple-50 p-10 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                Key Passage
              </p>

              <p className="mt-5 text-4xl font-bold text-purple-700">
                {currentPassage.name}
              </p>
            </div>
          )}

        {stage === "countdown" && (
          <div className="mt-12 rounded-2xl bg-blue-50 p-10 text-center">
            <p className="text-2xl font-bold text-gray-900">
              Get Ready!
            </p>

            <p className="mt-5 text-8xl font-bold text-blue-700">
              {countdown}
            </p>
          </div>
        )}

        {stage === "timer" &&
          currentPassage && (
            <div className="mt-8 text-center">
              <div className="rounded-2xl bg-purple-50 p-8">
                <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                  Find This Key Passage
                </p>

                <p className="mt-4 text-4xl font-bold text-purple-700">
                  {currentPassage.name}
                </p>

                <p className="mt-8 text-7xl font-bold text-red-600">
                  {timer}
                </p>

                <p className="mt-2 text-lg font-bold text-gray-700">
                  seconds
                </p>
              </div>
            </div>
          )}

        {stage === "yesno" && (
          <div className="mt-8 text-center">
            <div className="rounded-2xl bg-yellow-50 p-7">
              <p className="text-4xl font-bold text-red-700">
                🔔 TIME UP!
              </p>

              <p className="mt-6 text-2xl font-bold text-gray-900">
                Did you get it?
              </p>

              <p className="mt-4 text-lg text-gray-700">
                Say <strong>"Yes"</strong> or{" "}
                <strong>"No"</strong>.
              </p>

              <div className="mt-6 rounded-xl bg-white p-4">
                <p className="font-semibold text-gray-700">
                  🎤 Listening...
                </p>

                <p className="mt-2 min-h-7 text-lg text-gray-900">
                  {spokenText || "Say Yes or No"}
                </p>
              </div>
            </div>
          </div>
        )}

        {stage === "retry" && (
          <div className="mt-12 rounded-2xl bg-yellow-50 p-10 text-center">
            <p className="text-5xl font-bold text-orange-600">
              Let's try again!
            </p>

            <p className="mt-5 text-lg font-semibold text-gray-700">
              Get ready...
            </p>
          </div>
        )}

        {stage === "answer" &&
          currentPassage && (
            <div className="mt-8 text-center">
              <div className="rounded-2xl bg-blue-50 p-7">
                <p className="text-2xl font-bold text-gray-900">
                  Please say:
                </p>

                <p className="mt-4 text-xl font-semibold text-blue-700">
                  The key passage name
                  <br />
                  and its Bible reference.
                </p>

                <div className="mt-6 rounded-xl bg-white p-4">
                  <p className="font-semibold text-gray-700">
                    🎤 What I hear:
                  </p>

                  <p className="mt-2 min-h-12 text-lg text-gray-900">
                    {spokenText ||
                      "Your answer will appear here..."}
                  </p>
                </div>

                <button
                  onClick={stopAnswerListening}
                  className="mt-6 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white"
                >
                  🛑 Stop Listening
                </button>
              </div>
            </div>
          )}

        {stage === "result" &&
          result &&
          currentPassage && (
            <div className="mt-8">
              <div
                className={`rounded-2xl p-7 text-center ${
                  result.nameCorrect &&
                  result.referenceCorrect
                    ? "bg-green-50"
                    : "bg-yellow-50"
                }`}
              >
                <p className="text-3xl font-bold text-gray-900">
                  {result.nameCorrect &&
                  result.referenceCorrect
                    ? "🎉 Great Job!"
                    : "📖 Let's Check Your Answer"}
                </p>

                <div className="mt-6 space-y-4 text-left">
                  <p
                    className={
                      result.nameCorrect
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    {result.nameCorrect ? "✅" : "❌"}{" "}
                    Passage Name:{" "}
                    <strong>
                      {currentPassage.name}
                    </strong>
                  </p>

                  <p
                    className={
                      result.referenceCorrect
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    {result.referenceCorrect
                      ? "✅"
                      : "❌"}{" "}
                    Reference:{" "}
                    <strong>
                      {currentPassage.reference}
                    </strong>
                  </p>
                </div>

                {result.spoken && (
                  <div className="mt-6 rounded-xl bg-white p-4">
                    <p className="font-semibold text-gray-700">
                      The app heard:
                    </p>

                    <p className="mt-2 text-gray-900">
                      "{result.spoken}"
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => startSequence()}
                className="mt-5 w-full rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white"
              >
                🔄 Try Another Key Passage
              </button>

              <button
                onClick={resetDrill}
                className="mt-3 w-full rounded-xl bg-gray-200 px-4 py-3 text-sm font-bold text-gray-900"
              >
                ← Change Selected Passages
              </button>
            </div>
          )}

        {stage !== "select" &&
          stage !== "idle" &&
          stage !== "result" && (
            <button
              onClick={resetDrill}
              className="mt-5 w-full rounded-xl bg-gray-200 px-4 py-3 font-bold text-gray-900"
            >
              ← Cancel Drill
            </button>
          )}
      </div>
    </main>
  );
}

