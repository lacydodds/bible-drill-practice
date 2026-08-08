"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { redCycle } from "@/data/redCycle";

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

type WordResult = {
  correct: string;
  spoken: string | null;
  status: "exact" | "close" | "missed";
};

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\w']/g, "")
    .trim();
}

function getSimilarity(word1: string, word2: string): number {
  const a = normalizeWord(word1);
  const b = normalizeWord(word2);

  if (a === b) {
    return 1;
  }

  if (!a || !b) {
    return 0;
  }

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[a.length][b.length];
  const maxLength = Math.max(a.length, b.length);

  return 1 - distance / maxLength;
}

function compareWords(
  correctText: string,
  spokenText: string
): WordResult[] {
  const correctWords = correctText.split(/\s+/).filter(Boolean);
  const spokenWords = spokenText.split(/\s+/).filter(Boolean);

  const results: WordResult[] = [];

  let correctIndex = 0;
  let spokenIndex = 0;

  while (
    correctIndex < correctWords.length &&
    spokenIndex < spokenWords.length
  ) {
    const correctWord = correctWords[correctIndex];
    const spokenWord = spokenWords[spokenIndex];

    const normalizedCorrect = normalizeWord(correctWord);
    const normalizedSpoken = normalizeWord(spokenWord);

    // Exact match: punctuation and capitalization do not matter.
    if (normalizedCorrect === normalizedSpoken) {
      results.push({
        correct: correctWord,
        spoken: spokenWord,
        status: "exact",
      });

      correctIndex++;
      spokenIndex++;
      continue;
    }

    const directSimilarity = getSimilarity(
      correctWord,
      spokenWord
    );

    // Close single-word match.
    if (directSimilarity >= 0.65) {
      results.push({
        correct: correctWord,
        spoken: spokenWord,
        status: "close",
      });

      correctIndex++;
      spokenIndex++;
      continue;
    }

    // Check whether two spoken words together are
    // a close representation of one KJV word.
    //
    // Example:
    // strengtheneth
    // -> strengthen with
    if (spokenIndex + 1 < spokenWords.length) {
      const combinedSpoken =
        spokenWords[spokenIndex] +
        spokenWords[spokenIndex + 1];

      const combinedSimilarity = getSimilarity(
        correctWord,
        combinedSpoken
      );

      if (combinedSimilarity >= 0.55) {
        results.push({
          correct: correctWord,
          spoken: `${spokenWords[spokenIndex]} ${spokenWords[spokenIndex + 1]}`,
          status: "close",
        });

        correctIndex++;
        spokenIndex += 2;
        continue;
      }
    }

    // Check whether the NEXT spoken word matches
    // the current KJV word.
    if (spokenIndex + 1 < spokenWords.length) {
  const nextSpokenWord = spokenWords[spokenIndex + 1];

  const normalizedNextCorrect = normalizeWord(correctWord);
  const normalizedNextSpoken = normalizeWord(nextSpokenWord);

  const nextSimilarity = getSimilarity(
    correctWord,
    nextSpokenWord
  );

  if (normalizedNextCorrect === normalizedNextSpoken) {
    results.push({
      correct: correctWord,
      spoken: nextSpokenWord,
      status: "exact",
    });

    correctIndex++;
    spokenIndex += 2;
    continue;
  }

  if (nextSimilarity >= 0.65) {
    results.push({
      correct: correctWord,
      spoken: nextSpokenWord,
      status: "close",
    });

    correctIndex++;
    spokenIndex += 2;
    continue;
  }
}

    // Check whether the current spoken word belongs
    // to the NEXT KJV word.
    if (correctIndex + 1 < correctWords.length) {
      const nextCorrectWord = correctWords[correctIndex + 1];

      const nextCorrectSimilarity = getSimilarity(
        nextCorrectWord,
        spokenWord
      );

      if (nextCorrectSimilarity >= 0.65) {
        results.push({
          correct: correctWord,
          spoken: null,
          status: "missed",
        });

        correctIndex++;
        continue;
      }
    }

    // No useful match.
    results.push({
      correct: correctWord,
      spoken: spokenWord,
      status: "missed",
    });

    correctIndex++;
    spokenIndex++;
  }

  // Any remaining KJV words were missed.
  while (correctIndex < correctWords.length) {
    results.push({
      correct: correctWords[correctIndex],
      spoken: null,
      status: "missed",
    });

    correctIndex++;
  }

  return results;
}

function calculateScore(results: WordResult[]) {
  if (results.length === 0) {
    return {
      percentage: 0,
      exact: 0,
      close: 0,
      missed: 0,
    };
  }

  let exact = 0;
  let close = 0;
  let missed = 0;

  results.forEach((result) => {
    if (result.status === "exact") {
      exact++;
    } else if (result.status === "close") {
      close++;
    } else {
      missed++;
    }
  });

  const percentage = Math.round(
    ((exact + close) / results.length) * 100
  );

  return {
    percentage,
    exact,
    close,
    missed,
  };
}

export default function PracticePage() {
  const searchParams = useSearchParams();

  const selectedNumbers =
    searchParams
      .get("verses")
      ?.split(",")
      .map(Number)
      .filter(Boolean) ?? [];

  const practiceVerses = redCycle.filter((verse) =>
    selectedNumbers.includes(verse.number)
  );

  const [mode, setMode] = useState<"study" | "test">("study");
  const [currentVerse, setCurrentVerse] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [score, setScore] = useState<{
    percentage: number;
    exact: number;
    close: number;
    missed: number;
  } | null>(null);

  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);

  // Keeps the latest transcript available when
  // the Done Speaking button is clicked.
  const transcriptRef = useRef("");

  const verse = practiceVerses[currentVerse];

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Try Google Chrome."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognitionRef.current = recognition;

    setSpokenText("");
    setWordResults([]);
    setScore(null);
    setIsListening(true);

    transcriptRef.current = "";

    recognition.onresult = (
      event: SpeechRecognitionEvent
    ) => {
      let transcript = "";

      for (let i = 0; i < event.results.length; i++) {
        transcript +=
          event.results[i][0].transcript + " ";
      }

      const cleanedTranscript = transcript.trim();

      transcriptRef.current = cleanedTranscript;
      setSpokenText(cleanedTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setIsListening(false);

    const finalTranscript = transcriptRef.current;

    if (finalTranscript.trim()) {
      const results = compareWords(
        verse.text,
        finalTranscript
      );

      const newScore = calculateScore(results);

      setWordResults(results);
      setScore(newScore);
    }
  }

  function tryAgain() {
    stopListening();
    setSpokenText("");
    setWordResults([]);
    setScore(null);
    transcriptRef.current = "";
  }

  function nextVerse() {
    stopListening();
    setSpokenText("");
    setWordResults([]);
    setScore(null);
    transcriptRef.current = "";

    setCurrentVerse((current) =>
      current + 1 < practiceVerses.length
        ? current + 1
        : 0
    );
  }

  if (practiceVerses.length === 0) {
    return (
      <main className="min-h-screen bg-yellow-50 p-6">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-center text-3xl font-bold text-gray-900">
            📖 Bible Drill Practice
          </h1>

          <p className="mt-6 text-center text-lg text-gray-800">
            No verses were selected.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-yellow-50 p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-center text-3xl font-bold text-gray-900">
          📖 Bible Drill Practice
        </h1>

        <p className="mt-4 text-center text-lg text-gray-800">
          ⭐ Verse {currentVerse + 1} of{" "}
          {practiceVerses.length}
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => setMode("study")}
            className={`rounded-xl px-4 py-3 font-bold ${
              mode === "study"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-900"
            }`}
          >
            📚 Study Mode
          </button>

          <button
            onClick={() => setMode("test")}
            className={`rounded-xl px-4 py-3 font-bold ${
              mode === "test"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-900"
            }`}
          >
            🏆 Test Me
          </button>
        </div>

        <div className="mt-8 rounded-2xl bg-blue-50 p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {verse.reference}
          </h2>

          {mode === "study" && (
            <p className="mt-4 text-xl leading-relaxed text-gray-900">
              {verse.text}
            </p>
          )}

          {mode === "test" && (
            <p className="mt-4 text-lg font-semibold text-gray-900">
              Say the verse out loud!
            </p>
          )}
        </div>

        <div className="mt-8">
          {!isListening ? (
            <button
              onClick={startListening}
              className="w-full rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white"
            >
              🎤 Start Speaking
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white"
            >
              🛑 Done Speaking
            </button>
          )}
        </div>

        <div className="mt-6 min-h-32 rounded-xl border-2 border-gray-300 bg-gray-50 p-4">
          <p className="font-semibold text-gray-700">
            What I hear:
          </p>

          <p className="mt-3 text-lg leading-relaxed text-gray-900">
            {spokenText ||
              "Your words will appear here..."}
          </p>
        </div>

        {score && (
          <div className="mt-6 rounded-2xl bg-green-50 p-6">
            <p className="text-center text-2xl font-bold text-green-700">
              {score.percentage >= 90
                ? "🎉 Great Job!"
                : score.percentage >= 75
                ? "👍 Good Job!"
                : "💪 Keep Practicing!"}
            </p>

            <p className="mt-2 text-center text-xl font-semibold text-gray-900">
              {score.percentage}% correct
            </p>

            <div className="mt-4 flex justify-center gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {score.exact}
                </p>
                <p className="text-sm text-gray-700">
                  Exact
                </p>
              </div>

              <div>
                <p className="text-2xl font-bold text-yellow-600">
                  {score.close}
                </p>
                <p className="text-sm text-gray-700">
                  Close
                </p>
              </div>

              <div>
                <p className="text-2xl font-bold text-red-600">
                  {score.missed}
                </p>
                <p className="text-sm text-gray-700">
                  Missed
                </p>
              </div>
            </div>
          </div>
        )}

        {wordResults.length > 0 && (
          <div className="mt-6 rounded-2xl border-2 border-gray-200 bg-white p-5">
            <p className="mb-4 text-center text-xl font-bold text-gray-900">
              📖 Verse Check
            </p>

            <div className="text-lg leading-9">
              {wordResults.map((result, index) => {
                if (result.status === "exact") {
                  return (
                    <span
                      key={index}
                      className="text-gray-900"
                    >
                      {result.correct}{" "}
                    </span>
                  );
                }

                if (result.status === "close") {
                  return (
                    <span
                      key={index}
                      className="rounded bg-yellow-200 px-1 text-gray-900"
                      title={`You said: ${result.spoken}`}
                    >
                      {result.correct}{" "}
                    </span>
                  );
                }

                return (
                  <span
                    key={index}
                    className="rounded bg-red-200 px-1 text-red-900"
                    title={
                      result.spoken
                        ? `You said: ${result.spoken}`
                        : "Word missed"
                    }
                  >
                    {result.correct}{" "}
                  </span>
                );
              })}
            </div>

            {wordResults.some(
              (result) => result.status === "close"
            ) && (
              <div className="mt-5 rounded-xl bg-yellow-50 p-4">
                <p className="font-bold text-gray-900">
                  🟡 Close Words
                </p>

                <div className="mt-3 space-y-2">
                  {wordResults
                    .filter(
                      (result) =>
                        result.status === "close"
                    )
                    .map((result, index) => (
                      <p
                        key={index}
                        className="text-gray-800"
                      >
                        <span className="font-bold">
                          {result.correct}
                        </span>{" "}
                        — you said{" "}
                        <span className="font-semibold">
                          "{result.spoken}"
                        </span>
                      </p>
                    ))}
                </div>

                <p className="mt-3 text-sm text-gray-700">
                  You received credit for these words
                  because your answer was close. Keep
                  practicing the exact KJV wording!
                </p>
              </div>
            )}

            {wordResults.some(
              (result) => result.status === "missed"
            ) && (
              <div className="mt-4 rounded-xl bg-red-50 p-4">
                <p className="font-bold text-red-900">
                  🔴 Words to Practice
                </p>

                <div className="mt-3 space-y-2">
                  {wordResults
                    .filter(
                      (result) =>
                        result.status === "missed"
                    )
                    .map((result, index) => (
                      <p
                        key={index}
                        className="text-red-900"
                      >
                        <span className="font-bold">
                          {result.correct}
                        </span>

                        {result.spoken ? (
                          <>
                            {" "}
                            — you said{" "}
                            <span className="font-semibold">
                              "{result.spoken}"
                            </span>
                          </>
                        ) : (
                          <> — missed</>
                        )}
                      </p>
                    ))}
                </div>

                <p className="mt-3 text-sm text-red-800">
                  Don't worry! Try the verse again and
                  focus on these words.
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-center gap-5 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {score?.exact ?? 0}
                </p>
                <p className="text-sm text-gray-700">
                  Exact
                </p>
              </div>

              <div>
                <p className="text-2xl font-bold text-yellow-600">
                  {score?.close ?? 0}
                </p>
                <p className="text-sm text-gray-700">
                  Close
                </p>
              </div>

              <div>
                <p className="text-2xl font-bold text-red-600">
                  {score?.missed ?? 0}
                </p>
                <p className="text-sm text-gray-700">
                  Missed
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={tryAgain}
                className="rounded-xl bg-orange-400 px-4 py-3 font-bold text-white"
              >
                🔄 Try Again
              </button>

              <button
                onClick={nextVerse}
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
              >
                ➡️ Next Verse
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}