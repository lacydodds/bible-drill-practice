"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { redCycle } from "@/data/redCycle";

/* --------------------------------
Speech recognition types

These are intentionally local types.
We do NOT declare SpeechRecognition
globally because newer TypeScript DOM
libraries already provide those names.
-------------------------------- */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultListLike;
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: SpeechRecognitionEventLike) => void)
    | null;
  onend: (() => void) | null;
  onerror:
    | ((event: SpeechRecognitionErrorEventLike) => void)
    | null;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionInstanceLike;
}

interface SpeechRecognitionWindowLike {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
}

type WordStatus =
  | "exact"
  | "close"
  | "missed"
  | "extra";

type WordResult = {
  correct: string | null;
  spoken: string;
  status: WordStatus;
};

type ScoreResult = {
  percentage: number;
  exact: number;
  close: number;
  missed: number;
  extra: number;
};

const completionPrompts: Record<string, string> = {
  "Genesis 1:27":
    "So God created man in his own image",
  "Leviticus 22:31":
    "Therefore shall ye keep my commandments",
  "Deuteronomy 6:5":
    "And thou shalt love the Lord thy God",
  "1 Chronicles 16:8":
    "Give thanks unto the Lord",
  "Job 37:14":
    "Hearken unto this, O Job",
  "Psalm 19:14":
    "Let the words of my mouth",
  "Psalm 54:2":
    "Hear my prayer, O God",
  "Psalm 145:9":
    "The Lord is good to all",
  "Proverbs 8:33":
    "Hear instruction",
  "Proverbs 20:11":
    "Even a child is known",
  "Micah 6:8":
    "He hath shewed thee, O man, what is good",
  "Matthew 5:44":
    "But I say unto you, Love your enemies",
  "Matthew 21:22":
    "And all things, whatsoever ye shall",
  "Mark 13:31":
    "Heaven and earth shall pass away",
  "Luke 6:31":
    "And as ye would that men",
  "John 8:32":
    "And ye shall know",
  "John 15:13":
    "Greater love hath no man",
  "Acts 1:8":
    "But ye shall receive power",
  "Romans 14:12":
    "So then every one of us",
  "1 Corinthians 10:31":
    "Whether therefore ye eat",
  "1 Corinthians 14:40":
    "Let all things be",
  "Ephesians 6:1":
    "Children, obey",
  "Philippians 4:13":
    "I can do all things",
  "James 1:19":
    "Wherefore, my beloved brethren, let every man be",
  "1 John 4:19":
    "We love him",
};

/* --------------------------------
Basic word normalization
-------------------------------- */

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\w']/g, "")
    .trim();
}

function getSimilarity(
  word1: string,
  word2: string
): number {
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
      const cost =
        a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance =
    matrix[a.length][b.length];

  const maxLength = Math.max(
    a.length,
    b.length
  );

  return 1 - distance / maxLength;
}

/* --------------------------------
Reference normalization
-------------------------------- */

function normalizeOrdinalWords(
  text: string
): string {
  return text
    .toLowerCase()
    .replace(/\b1st\b/g, "1")
    .replace(/\bfirst\b/g, "1")
    .replace(/\b2nd\b/g, "2")
    .replace(/\bsecond\b/g, "2")
    .replace(/\b3rd\b/g, "3")
    .replace(/\bthird\b/g, "3");
}

function normalizeSpeechWords(
  text: string
): string[] {
  const normalized =
    normalizeOrdinalWords(text)
      .replace(/[,:;.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter(Boolean);
}

/* --------------------------------
Mobile speech handling
-------------------------------- */

function appendNewSpeech(
  existing: string,
  incoming: string
): string {
  const existingWords =
    normalizeSpeechWords(existing);

  const incomingWords =
    normalizeSpeechWords(incoming);

  if (incomingWords.length === 0) {
    return existing;
  }

  if (existingWords.length === 0) {
    return incomingWords.join(" ");
  }

  const existingNormalized =
    existingWords.map(normalizeWord);

  const incomingNormalized =
    incomingWords.map(normalizeWord);

  let bestOverlap = 0;

  const maxOverlap = Math.min(
    existingNormalized.length,
    incomingNormalized.length
  );

  for (
    let size = maxOverlap;
    size >= 1;
    size--
  ) {
    const existingSuffix =
      existingNormalized.slice(-size);

    const incomingPrefix =
      incomingNormalized.slice(0, size);

    if (
      existingSuffix.join(" ") ===
      incomingPrefix.join(" ")
    ) {
      bestOverlap = size;
      break;
    }
  }

  const newWords =
    incomingWords.slice(bestOverlap);

  if (newWords.length === 0) {
    return existingWords.join(" ");
  }

  return [
    ...existingWords,
    ...newWords,
  ].join(" ");
}

/* --------------------------------
Clean obvious immediate duplicates
-------------------------------- */

function cleanSpeechTranscript(
  text: string
): string {
  const words =
    normalizeSpeechWords(text);

  if (words.length === 0) {
    return "";
  }

  const cleaned: string[] = [];

  for (const word of words) {
    const normalized =
      normalizeWord(word);

    if (
      cleaned.length > 0 &&
      normalizeWord(
        cleaned[cleaned.length - 1]
      ) === normalized
    ) {
      continue;
    }

    cleaned.push(word);
  }

  return cleaned.join(" ");
}

/* --------------------------------
Compare spoken verse
-------------------------------- */

function compareWords(
  correctText: string,
  spokenText: string
): WordResult[] {
  const correctWords =
    normalizeSpeechWords(correctText);

  const spokenWords =
    normalizeSpeechWords(spokenText);

  const results: WordResult[] = [];

  let correctIndex = 0;
  let spokenIndex = 0;

  while (
    correctIndex < correctWords.length &&
    spokenIndex < spokenWords.length
  ) {
    const correctWord =
      correctWords[correctIndex];

    const spokenWord =
      spokenWords[spokenIndex];

    const normalizedCorrect =
      normalizeWord(correctWord);

    const normalizedSpoken =
      normalizeWord(spokenWord);

    if (
      normalizedCorrect ===
      normalizedSpoken
    ) {
      results.push({
        correct: correctWord,
        spoken: spokenWord,
        status: "exact",
      });

      correctIndex++;
      spokenIndex++;
      continue;
    }

    const directSimilarity =
      getSimilarity(
        correctWord,
        spokenWord
      );

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

    if (
      correctIndex + 1 <
      correctWords.length
    ) {
      const nextCorrect =
        correctWords[correctIndex + 1];

      if (
        normalizeWord(nextCorrect) ===
        normalizeWord(spokenWord)
      ) {
        results.push({
          correct: correctWord,
          spoken: "",
          status: "missed",
        });

        correctIndex++;
        continue;
      }

      const nextSimilarity =
        getSimilarity(
          nextCorrect,
          spokenWord
        );

      if (nextSimilarity >= 0.65) {
        results.push({
          correct: correctWord,
          spoken: "",
          status: "missed",
        });

        correctIndex++;
        continue;
      }
    }

    if (
      spokenIndex + 1 <
      spokenWords.length
    ) {
      const nextSpoken =
        spokenWords[spokenIndex + 1];

      const nextSpokenSimilarity =
        getSimilarity(
          correctWord,
          nextSpoken
        );

      if (
        normalizeWord(correctWord) ===
        normalizeWord(nextSpoken)
      ) {
        results.push({
          correct: null,
          spoken: spokenWord,
          status: "extra",
        });

        spokenIndex++;
        continue;
      }

      if (nextSpokenSimilarity >= 0.65) {
        results.push({
          correct: null,
          spoken: spokenWord,
          status: "extra",
        });

        spokenIndex++;
        continue;
      }
    }

    results.push({
      correct: correctWord,
      spoken: spokenWord,
      status: "missed",
    });

    correctIndex++;
    spokenIndex++;
  }

  while (
    correctIndex < correctWords.length
  ) {
    results.push({
      correct: correctWords[correctIndex],
      spoken: "",
      status: "missed",
    });

    correctIndex++;
  }

  while (
    spokenIndex < spokenWords.length
  ) {
    results.push({
      correct: null,
      spoken: spokenWords[spokenIndex],
      status: "extra",
    });

    spokenIndex++;
  }

  return results;
}

/* --------------------------------
Scoring
-------------------------------- */

function calculateScore(
  results: WordResult[]
): ScoreResult {
  if (results.length === 0) {
    return {
      percentage: 0,
      exact: 0,
      close: 0,
      missed: 0,
      extra: 0,
    };
  }

  let exact = 0;
  let close = 0;
  let missed = 0;
  let extra = 0;

  results.forEach((result) => {
    if (result.status === "exact") {
      exact++;
    } else if (result.status === "close") {
      close++;
    } else if (result.status === "missed") {
      missed++;
    } else {
      extra++;
    }
  });

  const totalCorrectWords =
    exact + close + missed;

  const percentage =
    totalCorrectWords === 0
      ? 0
      : Math.max(
          0,
          Math.round(
            ((exact + close) /
              totalCorrectWords) *
              100 -
              extra * 5
          )
        );

  return {
    percentage,
    exact,
    close,
    missed,
    extra,
  };
}

/* --------------------------------
Learning Mode
-------------------------------- */

function getHiddenWordIndexes(
  wordCount: number,
  round: number
): Set<number> {
  const hidden = new Set<number>();

  if (round <= 0) {
    return hidden;
  }

  const targetHidden = Math.min(
    wordCount,
    round === 1
      ? 2
      : round === 2
      ? 4
      : round === 3
      ? 6
      : Math.min(
          wordCount,
          Math.ceil(wordCount * 0.35) +
            (round - 4) * 3
        )
  );

  if (targetHidden >= wordCount) {
    for (let i = 0; i < wordCount; i++) {
      hidden.add(i);
    }

    return hidden;
  }

  for (
    let i = 0;
    i < targetHidden;
    i++
  ) {
    const index = Math.floor(
      (i * wordCount) / targetHidden
    );

    hidden.add(
      Math.min(index, wordCount - 1)
    );
  }

  let candidate = 0;

  while (
    hidden.size < targetHidden &&
    candidate < wordCount
  ) {
    if (!hidden.has(candidate)) {
      hidden.add(candidate);
    }

    candidate++;
  }

  return hidden;
}

function getLearningRoundCount(
  wordCount: number
): number {
  return Math.max(
    5,
    Math.ceil(wordCount / 3) + 4
  );
}

/* --------------------------------
Practice Page
-------------------------------- */

function PracticeContent() {
  const searchParams =
    useSearchParams();

  const router = useRouter();

  const selectedNumbers =
    searchParams
      .get("verses")
      ?.split(",")
      .map(Number)
      .filter(Boolean) ?? [];

  const modeParam =
    searchParams.get("mode");

  const mode:
    | "study"
    | "quotation"
    | "completion" =
    modeParam === "quotation"
      ? "quotation"
      : modeParam === "completion"
      ? "completion"
      : "study";

  const selectedVerses =
    redCycle.filter((verse) =>
      selectedNumbers.includes(
        verse.number
      )
    );

  const [
    practiceVerses,
    setPracticeVerses,
  ] = useState(selectedVerses);

  const [
    currentVerse,
    setCurrentVerse,
  ] = useState(0);

  const [
    isListening,
    setIsListening,
  ] = useState(false);

  const [
    countdown,
    setCountdown,
  ] = useState<
    "ready" | "go" | null
  >(null);

  const [
    spokenText,
    setSpokenText,
  ] = useState("");

  const [
    wordResults,
    setWordResults,
  ] = useState<WordResult[]>([]);

  const [score, setScore] =
    useState<ScoreResult | null>(null);

  const [
    learningRound,
    setLearningRound,
  ] = useState(0);

  const [
    learningAttempts,
    setLearningAttempts,
  ] = useState(0);

  const [
    learningMastered,
    setLearningMastered,
  ] = useState(false);

  const [
    learningRoundPassed,
    setLearningRoundPassed,
  ] = useState(false);

  const recognitionRef =
    useRef<SpeechRecognitionInstanceLike | null>(
      null
    );

  const finalTranscriptRef =
    useRef("");

  const interimTranscriptRef =
    useRef("");

  const readyTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const goTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const verse =
    practiceVerses[currentVerse];

  useEffect(() => {
    setPracticeVerses(
      shuffleArray(selectedVerses)
    );

    setCurrentVerse(0);
    setLearningRound(0);
    setLearningAttempts(0);
    setLearningMastered(false);
    setLearningRoundPassed(false);

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors.
        }

        recognitionRef.current = null;
      }
    };
  }, [searchParams.toString()]);

  function clearTimers() {
    if (readyTimerRef.current) {
      clearTimeout(
        readyTimerRef.current
      );

      readyTimerRef.current = null;
    }

    if (goTimerRef.current) {
      clearTimeout(
        goTimerRef.current
      );

      goTimerRef.current = null;
    }
  }

  function stopRecognitionOnly() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors.
      }

      recognitionRef.current = null;
    }

    setIsListening(false);
  }

  function startListening() {
    const speechWindow =
      window as unknown as SpeechRecognitionWindowLike;

    const SpeechRecognition =
      speechWindow.SpeechRecognition ||
      speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Try Google Chrome."
      );

      return;
    }

    if (!verse) {
      return;
    }

    clearTimers();

    setSpokenText("");
    setWordResults([]);
    setScore(null);
    setLearningRoundPassed(false);

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    const recognition =
      new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognitionRef.current =
      recognition;

    setIsListening(true);

    setCountdown("ready");

    recognition.onresult = (
      event: SpeechRecognitionEventLike
    ) => {
      let finalText =
        finalTranscriptRef.current;

      let interimText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result =
          event.results[i];

        const transcript =
          result[0]?.transcript?.trim() ||
          "";

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalText =
            appendNewSpeech(
              finalText,
              transcript
            );

          finalText =
            cleanSpeechTranscript(
              finalText
            );

          finalTranscriptRef.current =
            finalText;

          interimText = "";
        } else {
          interimText =
            appendNewSpeech(
              interimText,
              transcript
            );

          interimText =
            cleanSpeechTranscript(
              interimText
            );
        }
      }

      interimTranscriptRef.current =
        interimText;

      const displayText =
        appendNewSpeech(
          finalTranscriptRef.current,
          interimText
        );

      setSpokenText(
        cleanSpeechTranscript(
          displayText
        )
      );
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;

      const finalText =
        cleanSpeechTranscript(
          finalTranscriptRef.current
        );

      if (finalText) {
        setSpokenText(finalText);
      }
    };

    recognition.onerror = (
      event: SpeechRecognitionErrorEventLike
    ) => {
      if (
        event.error !== "no-speech"
      ) {
        console.log(
          "Speech recognition error:",
          event.error
        );
      }

      setIsListening(false);
      recognitionRef.current = null;

      clearTimers();
      setCountdown(null);
    };

    try {
      recognition.start();
    } catch {
      // Ignore duplicate start attempts.
    }

    readyTimerRef.current =
      setTimeout(() => {
        setCountdown("go");

        goTimerRef.current =
          setTimeout(() => {
            setCountdown(null);
          }, 500);
      }, 800);
  }

  function stopListening() {
    clearTimers();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors.
      }
    }

    setIsListening(false);
    setCountdown(null);

    setTimeout(() => {
      if (!verse) {
        return;
      }

      const finalTranscript =
        cleanSpeechTranscript(
          finalTranscriptRef.current ||
            interimTranscriptRef.current
        );

      if (!finalTranscript.trim()) {
        return;
      }

      setSpokenText(finalTranscript);

      const completeVerse =
        `${verse.text} ${verse.reference}`;

      const results = compareWords(
        completeVerse,
        finalTranscript
      );

      const newScore =
        calculateScore(results);

      setWordResults(results);
      setScore(newScore);

      if (mode === "study") {
        const passed =
          newScore.percentage >= 80;

        setLearningRoundPassed(
          passed
        );

        setLearningAttempts(
          (current) => current + 1
        );

        const wordCount =
          completeVerse
            .split(/\s+/)
            .filter(Boolean).length;

        const totalRounds =
          getLearningRoundCount(
            wordCount
          );

        if (
          passed &&
          learningRound >=
            totalRounds - 1
        ) {
          setLearningMastered(true);
        }
      }
    }, 250);
  }

  function tryAgain() {
    stopRecognitionOnly();
    clearTimers();

    setIsListening(false);
    setCountdown(null);
    setSpokenText("");
    setWordResults([]);
    setScore(null);
    setLearningRoundPassed(false);

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
  }

  function nextLearningRound() {
    if (!learningRoundPassed) {
      return;
    }

    if (!verse) {
      return;
    }

    const completeVerse =
      `${verse.text} ${verse.reference}`;

    const wordCount =
      completeVerse
        .split(/\s+/)
        .filter(Boolean).length;

    const totalRounds =
      getLearningRoundCount(
        wordCount
      );

    if (
      learningRound >=
      totalRounds - 1
    ) {
      setLearningMastered(true);
      return;
    }

    setLearningRound(
      (current) => current + 1
    );

    setSpokenText("");
    setWordResults([]);
    setScore(null);
    setLearningRoundPassed(false);

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
  }

  function nextVerse() {
    stopRecognitionOnly();
    clearTimers();

    setIsListening(false);
    setCountdown(null);
    setSpokenText("");
    setWordResults([]);
    setScore(null);

    setLearningRound(0);
    setLearningAttempts(0);
    setLearningMastered(false);
    setLearningRoundPassed(false);

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    setCurrentVerse(
      (current) =>
        current + 1 <
        practiceVerses.length
          ? current + 1
          : 0
    );
  }

  function backToVerses() {
    stopRecognitionOnly();
    clearTimers();

    router.push("/verses");
  }

  if (practiceVerses.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <p className="text-gray-900">
          No verses were selected.
        </p>

        <button
          onClick={backToVerses}
          className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
        >
          ← Back to Select Verses
        </button>
      </div>
    );
  }

  if (!verse) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <p className="text-gray-900">
          Unable to load this verse.
        </p>

        <button
          onClick={backToVerses}
          className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
        >
          ← Back to Select Verses
        </button>
      </div>
    );
  }

  const completeVerse =
    `${verse.text} ${verse.reference}`;

  const wordList =
    completeVerse
      .split(/\s+/)
      .filter(Boolean);

  const totalLearningRounds =
    getLearningRoundCount(
      wordList.length
    );

  const hiddenIndexes =
    getHiddenWordIndexes(
      wordList.length,
      learningRound
    );

  return (
    <div className="mx-auto max-w-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            📖 Bible Drill
          </h1>

          <p className="text-xs font-semibold text-gray-600">
            {mode === "study"
              ? "📚 Learning Mode"
              : mode === "quotation"
              ? "🏆 Quotation Drill"
              : "✏️ Completion Drill"}
          </p>
        </div>

        <button
          onClick={backToVerses}
          className="rounded-lg bg-gray-200 px-3 py-2 text-xs font-bold text-gray-900"
        >
          ← Select Verses
        </button>
      </div>

      {/* Verse number */}
      <p className="mt-1 text-center text-xs font-semibold text-gray-700">
        ⭐ Verse {currentVerse + 1} of{" "}
        {practiceVerses.length}
      </p>

      {/* --------------------------------
          LEARNING MODE
      -------------------------------- */}
      {mode === "study" && (
        <>
          {!learningMastered ? (
            <>
              <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2">
                <p className="text-center text-xs font-bold text-gray-700">
                  Learning Progress
                </p>

                <p className="mt-0.5 text-center text-base font-black text-blue-700">
                  Round {learningRound + 1} of{" "}
                  {totalLearningRounds}
                </p>

                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        ((learningRound + 1) /
                          totalLearningRounds) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-2 rounded-xl bg-blue-50 px-3 py-3">
                <p className="text-center text-[10px] font-bold uppercase tracking-wide text-gray-600">
                  Say the verse and reference
                </p>

                <div className="mt-2 flex flex-wrap justify-center gap-x-1 gap-y-1 text-center text-base leading-7 text-gray-900">
                  {wordList.map(
                    (word, index) => {
                      const hidden =
                        hiddenIndexes.has(
                          index
                        );

                      if (hidden) {
                        const width =
                          Math.min(
                            Math.max(
                              word.length *
                                0.45,
                              0.9
                            ),
                            4
                          );

                        return (
                          <span
                            key={index}
                            className="inline-block border-b-2 border-gray-600 align-bottom"
                            style={{
                              minWidth: `${width}rem`,
                            }}
                            aria-label="missing word"
                          >
                            &nbsp;
                          </span>
                        );
                      }

                      return (
                        <span
                          key={index}
                          className="whitespace-nowrap"
                        >
                          {word}
                        </span>
                      );
                    }
                  )}
                </div>
              </div>

              <p className="mt-1 text-center text-xs font-semibold text-gray-600">
                {wordList.length -
                  hiddenIndexes.size}{" "}
                of {wordList.length} words showing
              </p>

              <div className="mt-2">
                {countdown !== null ? (
                  <div
                    className={`rounded-xl p-2 text-center ${
                      countdown === "ready"
                        ? "bg-blue-50"
                        : "bg-green-50"
                    }`}
                  >
                    <p
                      className={`text-xl font-black ${
                        countdown === "ready"
                          ? "text-blue-700"
                          : "text-green-700"
                      }`}
                    >
                      {countdown ===
                      "ready"
                        ? "🎤 Ready?"
                        : "🚀 GO!"}
                    </p>

                    <p className="text-[10px] font-semibold text-gray-700">
                      {countdown ===
                      "ready"
                        ? "Microphone is listening..."
                        : "Start speaking!"}
                    </p>
                  </div>
                ) : !isListening ? (
                  <button
                    onClick={startListening}
                    className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm"
                  >
                    🎤 Start Speaking
                  </button>
                ) : (
                  <button
                    onClick={stopListening}
                    className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm"
                  >
                    🛑 Done Speaking
                  </button>
                )}
              </div>

              <div className="mt-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-bold text-gray-600">
                  What I hear:
                </p>

                <p className="mt-0.5 min-h-7 text-xs leading-5 text-gray-900">
                  {spokenText ||
                    "Your words will appear here..."}
                </p>
              </div>

              {score && (
                <div
                  className={`mt-2 rounded-xl px-3 py-3 ${
                    learningRoundPassed
                      ? "bg-green-50"
                      : "bg-yellow-50"
                  }`}
                >
                  <p className="text-center text-lg font-bold text-gray-900">
                    {learningRoundPassed
                      ? "🎉 Great Job!"
                      : "💪 Let's Practice This One Again"}
                  </p>

                  <p className="mt-0.5 text-center text-sm font-semibold text-gray-900">
                    {score.percentage}% correct
                  </p>

                  <div className="mt-2 flex justify-center gap-6 text-center">
                    <div>
                      <p className="text-lg font-bold text-green-600">
                        {score.exact}
                      </p>

                      <p className="text-[10px] text-gray-700">
                        Exact
                      </p>
                    </div>

                    <div>
                      <p className="text-lg font-bold text-yellow-600">
                        {score.close}
                      </p>

                      <p className="text-[10px] text-gray-700">
                        Close
                      </p>
                    </div>

                    <div>
                      <p className="text-lg font-bold text-red-600">
                        {score.missed}
                      </p>

                      <p className="text-[10px] text-gray-700">
                        Missed
                      </p>
                    </div>

                    {score.extra > 0 && (
                      <div>
                        <p className="text-lg font-bold text-orange-600">
                          {score.extra}
                        </p>

                        <p className="text-[10px] text-gray-700">
                          Extra
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={tryAgain}
                      className="rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-bold text-white"
                    >
                      🔄 Try Again
                    </button>

                    {learningRoundPassed ? (
                      <button
                        onClick={
                          nextLearningRound
                        }
                        className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white"
                      >
                        ➡️ Next Round
                      </button>
                    ) : (
                      <button
                        onClick={tryAgain}
                        className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white"
                      >
                        🎤 Try It Again
                      </button>
                    )}
                  </div>
                </div>
              )}

              {wordResults.length > 0 && (
                <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <p className="mb-1 text-center text-sm font-bold text-gray-900">
                    📖 Verse Check
                  </p>

                  <div className="flex flex-wrap gap-x-1 gap-y-1 text-xs leading-5">
                    {wordResults.map(
                      (
                        result,
                        index
                      ) => {
                        if (
                          result.status ===
                          "exact"
                        ) {
                          return (
                            <span
                              key={index}
                              className="whitespace-nowrap text-gray-900"
                            >
                              {
                                result.correct
                              }
                            </span>
                          );
                        }

                        if (
                          result.status ===
                          "close"
                        ) {
                          return (
                            <span
                              key={index}
                              className="whitespace-nowrap rounded bg-yellow-200 px-1 text-gray-900"
                              title={`You said: ${result.spoken}`}
                            >
                              {
                                result.correct
                              }
                            </span>
                          );
                        }

                        if (
                          result.status ===
                          "extra"
                        ) {
                          return (
                            <span
                              key={index}
                              className="whitespace-nowrap rounded bg-orange-200 px-1 font-bold text-orange-900"
                              title={`Extra word: ${result.spoken}`}
                            >
                              +
                              {
                                result.spoken
                              }
                            </span>
                          );
                        }

                        return (
                          <span
                            key={index}
                            className="whitespace-nowrap rounded bg-red-200 px-1 text-red-900"
                            title={
                              result.spoken
                                ? `You said: ${result.spoken}`
                                : "Word missed"
                            }
                          >
                            {
                              result.correct
                            }
                          </span>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4">
              <div className="rounded-2xl bg-green-50 p-5 text-center">
                <p className="text-3xl font-bold text-green-700">
                  🎉 Verse Mastered!
                </p>

                <p className="mt-2 text-lg font-bold text-gray-900">
                  {verse.reference}
                </p>

                <p className="mt-2 text-sm text-gray-700">
                  You worked through all the learning rounds.
                </p>

                <div className="mt-3 rounded-xl bg-white p-3">
                  <p className="text-xs font-semibold text-gray-600">
                    Attempts
                  </p>

                  <p className="text-2xl font-black text-blue-700">
                    {learningAttempts}
                  </p>
                </div>
              </div>

              <button
                onClick={nextVerse}
                className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white"
              >
                ➡️ Next Verse
              </button>

              <button
                onClick={() => {
                  setLearningRound(0);
                  setLearningAttempts(0);
                  setLearningMastered(false);
                  setLearningRoundPassed(
                    false
                  );
                  setSpokenText("");
                  setWordResults([]);
                  setScore(null);

                  finalTranscriptRef.current =
                    "";

                  interimTranscriptRef.current =
                    "";
                }}
                className="mt-2 w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                🔄 Practice This Verse Again
              </button>
            </div>
          )}
        </>
      )}

      {/* --------------------------------
          QUOTATION MODE
      -------------------------------- */}
      {mode === "quotation" && (
        <>
          <div className="mt-2 rounded-xl bg-blue-50 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600">
              Say the entire verse, then the reference
            </p>

            <p className="mt-1 text-xl font-bold text-purple-700">
              {verse.reference}
            </p>
          </div>

          <div className="mt-2">
            {countdown !== null ? (
              <div
                className={`rounded-xl p-2 text-center ${
                  countdown === "ready"
                    ? "bg-blue-50"
                    : "bg-green-50"
                }`}
              >
                <p
                  className={`text-xl font-black ${
                    countdown === "ready"
                      ? "text-blue-700"
                      : "text-green-700"
                  }`}
                >
                  {countdown ===
                  "ready"
                    ? "🎤 Ready?"
                    : "🚀 GO!"}
                </p>
              </div>
            ) : !isListening ? (
              <button
                onClick={startListening}
                className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                🎤 Start Speaking
              </button>
            ) : (
              <button
                onClick={stopListening}
                className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                🛑 Done Speaking
              </button>
            )}
          </div>

          <div className="mt-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2">
            <p className="text-[10px] font-bold text-gray-600">
              What I hear:
            </p>

            <p className="mt-0.5 min-h-7 text-xs leading-5 text-gray-900">
              {spokenText ||
                "Your words will appear here..."}
            </p>
          </div>

          {score && (
            <div className="mt-2 rounded-xl bg-green-50 px-3 py-2">
              <p className="text-center text-base font-bold text-green-700">
                {score.percentage >= 90
                  ? "🎉 Great Job!"
                  : score.percentage >= 75
                  ? "👍 Good Job!"
                  : "💪 Keep Practicing!"}
              </p>

              <p className="text-center text-sm font-semibold text-gray-900">
                {score.percentage}% correct
              </p>
            </div>
          )}

          {wordResults.length > 0 && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
              <p className="mb-1 text-center text-sm font-bold text-gray-900">
                📖 Verse Check
              </p>

              <div className="flex flex-wrap gap-x-1 gap-y-1 text-xs leading-5">
                {wordResults.map(
                  (
                    result,
                    index
                  ) => {
                    if (
                      result.status ===
                      "extra"
                    ) {
                      return (
                        <span
                          key={index}
                          className="whitespace-nowrap rounded bg-orange-200 px-1 font-bold text-orange-900"
                        >
                          +
                          {result.spoken}
                        </span>
                      );
                    }

                    return (
                      <span
                        key={index}
                        className={`whitespace-nowrap rounded px-1 ${
                          result.status ===
                          "exact"
                            ? "text-gray-900"
                            : result.status ===
                              "close"
                            ? "bg-yellow-200 text-gray-900"
                            : "bg-red-200 text-red-900"
                        }`}
                      >
                        {
                          result.correct
                        }
                      </span>
                    );
                  }
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={tryAgain}
                  className="rounded-xl bg-orange-400 px-3 py-2.5 text-xs font-bold text-white"
                >
                  🔄 Try Again
                </button>

                <button
                  onClick={nextVerse}
                  className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white"
                >
                  ➡️ Next Verse
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* --------------------------------
          COMPLETION MODE
      -------------------------------- */}
      {mode === "completion" && (
        <>
          <div className="mt-2 rounded-xl bg-blue-50 px-3 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-600">
              Finish the verse, then give the reference
            </p>

            <p className="mt-2 text-base font-bold leading-6 text-orange-700">
              {completionPrompts[
                verse.reference
              ]}
            </p>

            <p className="mt-1 text-[10px] font-semibold text-gray-600">
              Continue with the rest of the verse and then say its Bible reference.
            </p>
          </div>

          <div className="mt-2">
            {countdown !== null ? (
              <div
                className={`rounded-xl p-2 text-center ${
                  countdown === "ready"
                    ? "bg-blue-50"
                    : "bg-green-50"
                }`}
              >
                <p
                  className={`text-xl font-black ${
                    countdown === "ready"
                      ? "text-blue-700"
                      : "text-green-700"
                  }`}
                >
                  {countdown ===
                  "ready"
                    ? "🎤 Ready?"
                    : "🚀 GO!"}
                </p>
              </div>
            ) : !isListening ? (
              <button
                onClick={startListening}
                className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                🎤 Start Speaking
              </button>
            ) : (
              <button
                onClick={stopListening}
                className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                🛑 Done Speaking
              </button>
            )}
          </div>

          <div className="mt-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2">
            <p className="text-[10px] font-bold text-gray-600">
              What I hear:
            </p>

            <p className="mt-0.5 min-h-7 text-xs leading-5 text-gray-900">
              {spokenText ||
                "Your words will appear here..."}
            </p>
          </div>

          {score && (
            <div className="mt-2 rounded-xl bg-green-50 px-3 py-2">
              <p className="text-center text-base font-bold text-green-700">
                {score.percentage >= 90
                  ? "🎉 Great Job!"
                  : score.percentage >= 75
                  ? "👍 Good Job!"
                  : "💪 Keep Practicing!"}
              </p>

              <p className="text-center text-sm font-semibold text-gray-900">
                {score.percentage}% correct
              </p>
            </div>
          )}

          {wordResults.length > 0 && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
              <p className="mb-1 text-center text-sm font-bold text-gray-900">
                📖 Verse Check
              </p>

              <div className="flex flex-wrap gap-x-1 gap-y-1 text-xs leading-5">
                {wordResults.map(
                  (
                    result,
                    index
                  ) => {
                    if (
                      result.status ===
                      "extra"
                    ) {
                      return (
                        <span
                          key={index}
                          className="whitespace-nowrap rounded bg-orange-200 px-1 font-bold text-orange-900"
                        >
                          +
                          {result.spoken}
                        </span>
                      );
                    }

                    return (
                      <span
                        key={index}
                        className={`whitespace-nowrap rounded px-1 ${
                          result.status ===
                          "exact"
                            ? "text-gray-900"
                            : result.status ===
                              "close"
                            ? "bg-yellow-200 text-gray-900"
                            : "bg-red-200 text-red-900"
                        }`}
                      >
                        {
                          result.correct
                        }
                      </span>
                    );
                  }
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={tryAgain}
                  className="rounded-xl bg-orange-400 px-3 py-2.5 text-xs font-bold text-white"
                >
                  🔄 Try Again
                </button>

                <button
                  onClick={nextVerse}
                  className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white"
                >
                  ➡️ Next Verse
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------------
Shuffle
-------------------------------- */

function shuffleArray<T>(
  array: T[]
): T[] {
  const shuffled = [...array];

  for (
    let i = shuffled.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [
      shuffled[i],
      shuffled[j],
    ] = [
      shuffled[j],
      shuffled[i],
    ];
  }

  return shuffled;
}

/* --------------------------------
Page
-------------------------------- */

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl p-4 text-center text-gray-900">
          Loading Bible Drill...
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}

