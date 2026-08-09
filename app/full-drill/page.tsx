"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { redCycle } from "@/data/redCycle";
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

type DrillMode =
  | "quotation"
  | "completion"
  | "book"
  | "keypassage";

type DrillQuestion = {
  id: string;
  mode: DrillMode;
  verseIndex?: number;
  passageIndex?: number;
};

type WordResult = {
  correct: string;
  spoken: string | null;
  status: "exact" | "close" | "missed";
};

type ReferenceResult = {
  correct: string;
  spoken: string;
  isCorrect: boolean;
};

type QuestionResult = {
  questionId: string;
  mode: DrillMode;
  correct: boolean;
};

const completionPrompts: Record<string, string> = {
  "Genesis 1:27": "So God created man in his own image",
  "Leviticus 22:31": "Therefore shall ye keep my commandments",
  "Deuteronomy 6:5": "And thou shalt love the Lord thy God",
  "1 Chronicles 16:8": "Give thanks unto the Lord",
  "Job 37:14": "Hearken unto this, O Job",
  "Psalm 19:14": "Let the words of my mouth",
  "Psalm 54:2": "Hear my prayer, O God",
  "Psalm 145:9": "The Lord is good to all",
  "Proverbs 8:33": "Hear instruction",
  "Proverbs 20:11": "Even a child is known",
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

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [
      shuffled[j],
      shuffled[i],
    ];
  }

  return shuffled;
}

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

function compareWords(
  correctText: string,
  spokenText: string
): WordResult[] {
  const correctWords = correctText
    .split(/\s+/)
    .filter(Boolean);

  const spokenWords = spokenText
    .split(/\s+/)
    .filter(Boolean);

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

    const similarity = getSimilarity(
      correctWord,
      spokenWord
    );

    if (similarity >= 0.65) {
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
        correctWords[
          correctIndex + 1
        ];

      const nextSimilarity =
        getSimilarity(
          nextCorrect,
          spokenWord
        );

      if (nextSimilarity >= 0.65) {
        results.push({
          correct: correctWord,
          spoken: null,
          status: "missed",
        });

        correctIndex++;
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
      spoken: null,
      status: "missed",
    });

    correctIndex++;
  }

  return results;
}

function calculateScore(
  results: WordResult[]
) {
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
    } else if (
      result.status === "close"
    ) {
      close++;
    } else {
      missed++;
    }
  });

  const percentage = Math.round(
    ((exact + close) /
      results.length) *
      100
  );

  return {
    percentage,
    exact,
    close,
    missed,
  };
}

const numberWords: Record<
  string,
  number
> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function normalizeReferenceText(
  text: string
): string {
  return text
    .toLowerCase()
    .replace(/[,:;.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNumberValue(
  word: string
): number | null {
  if (/^\d+$/.test(word)) {
    return Number(word);
  }

  if (word in numberWords) {
    return numberWords[word];
  }

  return null;
}

function parseNumberGroups(
  words: string[]
): number[] {
  const numbers: number[] = [];

  let i = 0;

  while (i < words.length) {
    const current =
      getNumberValue(words[i]);

    if (current === null) {
      i++;
      continue;
    }

    if (
      current >= 20 &&
      current <= 90 &&
      current % 10 === 0 &&
      i + 1 < words.length
    ) {
      const next =
        getNumberValue(
          words[i + 1]
        );

      if (
        next !== null &&
        next >= 1 &&
        next <= 9
      ) {
        numbers.push(
          current + next
        );

        i += 2;
        continue;
      }
    }

    numbers.push(current);
    i++;
  }

  return numbers;
}

function getBookAliases(
  book: string
): string[] {
  const aliases = [
    book.toLowerCase(),
  ];

  const numberedBook =
    book.match(
      /^([123])\s+(.+)$/i
    );

  if (numberedBook) {
    const number =
      numberedBook[1];

    const bookName =
      numberedBook[2].toLowerCase();

    const wordAliases: Record<
      string,
      string[]
    > = {
      "1": ["first", "one"],
      "2": ["second", "two"],
      "3": ["third", "three"],
    };

    aliases.push(
      ...wordAliases[number].map(
        (word) =>
          `${word} ${bookName}`
      )
    );
  }

  if (
    book.toLowerCase() ===
    "psalm"
  ) {
    aliases.push("psalms");
  }

  return aliases;
}

function parseReference(
  reference: string
) {
  const match = reference.match(
    /^(.+)\s+(\d+):(\d+)$/
  );

  if (!match) {
    return null;
  }

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function findReferenceInSpeech(
  spokenText: string,
  correctReference: string
): boolean {
  const parsed =
    parseReference(
      correctReference
    );

  if (!parsed) {
    return false;
  }

  const normalized =
    normalizeReferenceText(
      spokenText
    );

  const speechWords =
    normalized.split(" ");

  const aliases =
    getBookAliases(parsed.book);

  let foundBookIndex = -1;
  let foundAlias = "";

  for (const alias of aliases) {
    const aliasWords =
      alias.split(" ");

    for (
      let i = 0;
      i <=
        speechWords.length -
          aliasWords.length;
      i++
    ) {
      let matches = true;

      for (
        let j = 0;
        j < aliasWords.length;
        j++
      ) {
        if (
          speechWords[i + j] !==
          aliasWords[j]
        ) {
          matches = false;
          break;
        }
      }

      if (
        matches &&
        i >= foundBookIndex
      ) {
        foundBookIndex = i;
        foundAlias = alias;
      }
    }
  }

  if (foundBookIndex === -1) {
    return false;
  }

  const afterBook =
    speechWords.slice(
      foundBookIndex +
        foundAlias.split(" ")
          .length
    );

  const cleaned =
    afterBook.filter(
      (word) =>
        word !== "chapter" &&
        word !== "chapters" &&
        word !== "verse" &&
        word !== "verses" &&
        word !== "colon" &&
        word !== "and"
    );

  const numbers =
    parseNumberGroups(cleaned);

  if (numbers.length < 2) {
    return false;
  }

  return (
    numbers[0] ===
      parsed.chapter &&
    numbers[1] ===
      parsed.verse
  );
}

function normalizeSimple(
  text: string
): string {
  return text
    .toLowerCase()
    .replace(
      /[.,!?;:'"–—-]/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function bookMatches(
  spoken: string,
  correct: string
): boolean {
  const normalized =
    normalizeSimple(spoken);

  const correctNormalized =
    normalizeSimple(correct);

  if (
    normalized.includes(
      correctNormalized
    )
  ) {
    return true;
  }

  const numbered =
    correct.match(
      /^([123])\s+(.+)$/i
    );

  if (numbered) {
    const number =
      numbered[1];

    const name =
      numbered[2];

    const aliases: Record<
      string,
      string[]
    > = {
      "1": [
        `first ${name}`,
        `one ${name}`,
      ],
      "2": [
        `second ${name}`,
        `two ${name}`,
      ],
      "3": [
        `third ${name}`,
        `three ${name}`,
      ],
    };

    return aliases[number].some(
      (alias) =>
        normalized.includes(
          normalizeSimple(alias)
        )
    );
  }

  if (
    correct.toLowerCase() ===
    "Psalm".toLowerCase()
  ) {
    return (
      normalized.includes("psalm") ||
      normalized.includes("psalms")
    );
  }

  return false;
}

function modeLabel(
  mode: DrillMode
): string {
  switch (mode) {
    case "quotation":
      return "🏆 Quotation Drill";

    case "completion":
      return "✏️ Completion Drill";

    case "book":
      return "📖 Book Drill";

    case "keypassage":
      return "📜 Key Passage Drill";
  }
}

function modeColor(
  mode: DrillMode
): string {
  switch (mode) {
    case "quotation":
      return "bg-purple-50 text-purple-700";

    case "completion":
      return "bg-orange-50 text-orange-700";

    case "book":
      return "bg-green-50 text-green-700";

    case "keypassage":
      return "bg-blue-50 text-blue-700";
  }
}

export default function FullDrillPage() {
  const router = useRouter();

  const [questions, setQuestions] =
    useState<DrillQuestion[]>([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [stage, setStage] =
    useState<
      | "idle"
      | "question"
      | "listening"
      | "result"
      | "finished"
    >("idle");

  const [countdown, setCountdown] =
    useState<number | null>(null);

  const [spokenText, setSpokenText] =
    useState("");

  const [questionResults, setQuestionResults] =
    useState<QuestionResult[]>([]);

  const [currentCorrect, setCurrentCorrect] =
    useState<boolean | null>(null);

  const [isListening, setIsListening] =
    useState(false);

  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(
      null
    );

  const transcriptRef =
    useRef("");

  const countdownRef =
    useRef<NodeJS.Timeout | null>(
      null
    );

  const questionTimerRef =
    useRef<NodeJS.Timeout | null>(
      null
    );

  const currentQuestion =
    questions[currentIndex];

  const currentVerse =
    currentQuestion?.verseIndex !==
      undefined
      ? redCycle[
          currentQuestion.verseIndex
        ]
      : null;

  const currentPassage =
    currentQuestion?.passageIndex !==
      undefined
      ? keyPassages[
          currentQuestion.passageIndex
        ]
      : null;

  useEffect(() => {
    return () => {
      stopRecognition();

      if (
        countdownRef.current
      ) {
        clearInterval(
          countdownRef.current
        );
      }

      if (
        questionTimerRef.current
      ) {
        clearTimeout(
          questionTimerRef.current
        );
      }
    };
  }, []);

  function stopRecognition() {
    if (
      recognitionRef.current
    ) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors.
      }

      recognitionRef.current =
        null;
    }

    setIsListening(false);
  }

  function clearTimers() {
    if (
      countdownRef.current
    ) {
      clearInterval(
        countdownRef.current
      );

      countdownRef.current =
        null;
    }

    if (
      questionTimerRef.current
    ) {
      clearTimeout(
        questionTimerRef.current
      );

      questionTimerRef.current =
        null;
    }
  }

  function createQuestions() {
    /*
     * Choose 18 unique Bible verses for
     * quotation, completion, and book.
     */
    const verseIndexes =
      shuffleArray(
        redCycle.map(
          (_, index) => index
        )
      ).slice(0, 18);

    const quotationIndexes =
      verseIndexes.slice(0, 6);

    const completionIndexes =
      verseIndexes.slice(6, 12);

    const bookIndexes =
      verseIndexes.slice(12, 18);

    /*
     * Choose six different key passages.
     */
    const passageIndexes =
      shuffleArray(
        keyPassages.map(
          (_, index) => index
        )
      ).slice(0, 6);

    const newQuestions: DrillQuestion[] =
      [];

    quotationIndexes.forEach(
      (verseIndex, index) => {
        newQuestions.push({
          id: `quotation-${index}-${verseIndex}`,
          mode: "quotation",
          verseIndex,
        });
      }
    );

    completionIndexes.forEach(
      (verseIndex, index) => {
        newQuestions.push({
          id: `completion-${index}-${verseIndex}`,
          mode: "completion",
          verseIndex,
        });
      }
    );

    bookIndexes.forEach(
      (verseIndex, index) => {
        newQuestions.push({
          id: `book-${index}-${verseIndex}`,
          mode: "book",
          verseIndex,
        });
      }
    );

    passageIndexes.forEach(
      (passageIndex, index) => {
        newQuestions.push({
          id: `keypassage-${index}-${passageIndex}`,
          mode: "keypassage",
          passageIndex,
        });
      }
    );

    return shuffleArray(
      newQuestions
    );
  }

  function startDrill() {
    stopRecognition();
    clearTimers();

    const newQuestions =
      createQuestions();

    setQuestions(newQuestions);
    setCurrentIndex(0);
    setQuestionResults([]);
    setSpokenText("");
    setCurrentCorrect(null);
    setStage("question");

    showQuestion();
  }

  function showQuestion() {
    stopRecognition();
    clearTimers();

    setSpokenText("");
    transcriptRef.current = "";
    setCurrentCorrect(null);
    setCountdown(null);
    setStage("question");

    questionTimerRef.current =
      setTimeout(() => {
        startCountdown();
      }, 2500);
  }

  function startCountdown() {
    let count = 3;

    setCountdown(count);

    countdownRef.current =
      setInterval(() => {
        count--;

        if (count > 0) {
          setCountdown(count);
          return;
        }

        if (
          countdownRef.current
        ) {
          clearInterval(
            countdownRef.current
          );

          countdownRef.current =
            null;
        }

        setCountdown(null);

        startListening();
      }, 1000);
  }

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

    stopRecognition();

    transcriptRef.current = "";
    setSpokenText("");
    setIsListening(true);
    setStage("listening");

    const recognition =
      new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognitionRef.current =
      recognition;

    recognition.onresult = (
      event: SpeechRecognitionEvent
    ) => {
      let transcript = "";

      for (
        let i = 0;
        i < event.results.length;
        i++
      ) {
        transcript +=
          event.results[i][0]
            .transcript + " ";
      }

      const cleaned =
        transcript.trim();

      transcriptRef.current =
        cleaned;

      setSpokenText(cleaned);

      /*
       * Book drills are automatically
       * evaluated once the child says
       * the book.
       */
      if (
        currentQuestion?.mode ===
          "book" &&
        bookMatches(
          cleaned,
          currentVerse?.reference
            .split(" ")
            .slice(0, -1)
            .join(" ") ?? ""
        )
      ) {
        finishCurrentQuestion(true);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current =
        null;
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current =
        null;
    };

    try {
      recognition.start();
    } catch {
      // Ignore duplicate starts.
    }
  }

  function evaluateCurrentQuestion(
    spoken: string
  ): boolean {
    if (!currentQuestion) {
      return false;
    }

    if (
      currentQuestion.mode ===
      "quotation"
    ) {
      if (!currentVerse) {
        return false;
      }

      const wordResults =
        compareWords(
          currentVerse.text,
          spoken
        );

      const score =
        calculateScore(wordResults);

      const referenceCorrect =
        findReferenceInSpeech(
          spoken,
          currentVerse.reference
        );

      return (
        score.percentage >= 90 &&
        referenceCorrect
      );
    }

    if (
      currentQuestion.mode ===
      "completion"
    ) {
      if (!currentVerse) {
        return false;
      }

      const wordResults =
        compareWords(
          currentVerse.text,
          spoken
        );

      const score =
        calculateScore(wordResults);

      const referenceCorrect =
        findReferenceInSpeech(
          spoken,
          currentVerse.reference
        );

      return (
        score.percentage >= 90 &&
        referenceCorrect
      );
    }

    if (
      currentQuestion.mode ===
      "book"
    ) {
      if (!currentVerse) {
        return false;
      }

      const book =
        currentVerse.reference
          .split(" ")
          .slice(0, -1)
          .join(" ");

      return bookMatches(
        spoken,
        book
      );
    }

    if (
      currentQuestion.mode ===
      "keypassage"
    ) {
      if (!currentPassage) {
        return false;
      }

      const nameCorrect =
        normalizeSimple(
          spoken
        ).includes(
          normalizeSimple(
            currentPassage.name
          )
        );

      const referenceCorrect =
        findReferenceInSpeech(
          spoken,
          currentPassage.reference
        );

      return (
        nameCorrect &&
        referenceCorrect
      );
    }

    return false;
  }

  function finishCurrentQuestion(
    forcedResult?: boolean
  ) {
    stopRecognition();
    clearTimers();

    const spoken =
      transcriptRef.current;

    const correct =
      forcedResult ??
      evaluateCurrentQuestion(
        spoken
      );

    setCurrentCorrect(correct);

    if (!currentQuestion) {
      return;
    }

    const result: QuestionResult =
      {
        questionId:
          currentQuestion.id,
        mode:
          currentQuestion.mode,
        correct,
      };

    setQuestionResults(
      (previous) => [
        ...previous.filter(
          (item) =>
            item.questionId !==
            result.questionId
        ),
        result,
      ]
    );

    setStage("result");

    questionTimerRef.current =
      setTimeout(() => {
        goToNextQuestion(
          result
        );
      }, 2200);
  }

  function goToNextQuestion(
    completedResult?: QuestionResult
  ) {
    stopRecognition();
    clearTimers();

    const nextResults =
      completedResult
        ? [
            ...questionResults.filter(
              (item) =>
                item.questionId !==
                completedResult.questionId
            ),
            completedResult,
          ]
        : questionResults;

    if (
      currentIndex + 1 >=
      questions.length
    ) {
      setQuestionResults(
        nextResults
      );

      setStage("finished");
      return;
    }

    setCurrentIndex(
      (index) => index + 1
    );

    setSpokenText("");
    transcriptRef.current = "";

    setCurrentCorrect(null);

    questionTimerRef.current =
      setTimeout(() => {
        showQuestion();
      }, 300);
  }

  function manualStop() {
    stopRecognition();

    const spoken =
      transcriptRef.current;

    if (!spoken.trim()) {
      return;
    }

    finishCurrentQuestion();
  }

  function restartDrill() {
    stopRecognition();
    clearTimers();

    setQuestions([]);
    setCurrentIndex(0);
    setQuestionResults([]);
    setSpokenText("");
    setCurrentCorrect(null);
    setCountdown(null);
    setStage("idle");
  }

  function backHome() {
    stopRecognition();
    clearTimers();
    router.push("/");
  }

  const totalCorrect =
    questionResults.filter(
      (result) =>
        result.correct
    ).length;

  const completedCount =
    questionResults.length;

  return (
    <main className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-900">
              📖 Bible Drill
            </h1>

            <p className="mt-1 text-sm font-semibold text-gray-600">
              🏆 Full Bible Drill
            </p>
          </div>

          <button
            onClick={backHome}
            className="rounded-lg bg-gray-200 px-3 py-2 text-xs font-bold text-gray-900"
          >
            ← Home
          </button>
        </div>

        {stage === "idle" && (
          <div className="mt-10">
            <div className="rounded-2xl bg-blue-50 p-7 text-center">
              <p className="text-5xl">
                🏆
              </p>

              <h2 className="mt-4 text-3xl font-black text-blue-700">
                Full Bible Drill
              </h2>

              <p className="mt-4 text-lg leading-7 text-gray-800">
                You will complete 24
                drills.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm font-bold">
                <div className="rounded-xl bg-purple-100 p-4 text-purple-800">
                  6 Quotation
                </div>

                <div className="rounded-xl bg-orange-100 p-4 text-orange-800">
                  6 Completion
                </div>

                <div className="rounded-xl bg-green-100 p-4 text-green-800">
                  6 Book
                </div>

                <div className="rounded-xl bg-blue-100 p-4 text-blue-800">
                  6 Key Passage
                </div>
              </div>

              <p className="mt-6 text-sm font-semibold text-gray-700">
                Questions will be randomly
                mixed, and no question will
                repeat.
              </p>

              <button
                onClick={startDrill}
                className="mt-8 w-full rounded-xl bg-blue-600 px-4 py-5 text-xl font-black text-white shadow"
              >
                ▶️ Start Full Bible Drill
              </button>
            </div>
          </div>
        )}

        {stage !== "idle" &&
          stage !== "finished" &&
          currentQuestion && (
            <>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700">
                  Question{" "}
                  {currentIndex + 1} of{" "}
                  {questions.length}
                </p>

                <p className="text-sm font-bold text-green-700">
                  Correct:{" "}
                  {totalCorrect}
                </p>
              </div>

              <div
                className={`mt-3 rounded-xl px-4 py-3 text-center font-black ${modeColor(
                  currentQuestion.mode
                )}`}
              >
                {modeLabel(
                  currentQuestion.mode
                )}
              </div>
            </>
          )}

        {stage === "question" &&
          currentQuestion && (
            <div className="mt-8 rounded-2xl bg-gray-50 p-8 text-center">
              {currentQuestion.mode ===
                "quotation" &&
                currentVerse && (
                  <>
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                      Quote the verse
                    </p>

                    <p className="mt-5 text-4xl font-black text-purple-700">
                      {currentVerse.reference}
                    </p>

                    <p className="mt-6 text-lg font-semibold text-gray-700">
                      Say the entire verse,
                      then give the
                      reference.
                    </p>
                  </>
                )}

              {currentQuestion.mode ===
                "completion" &&
                currentVerse && (
                  <>
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                      Complete the verse
                    </p>

                    <p className="mt-5 text-xl font-bold leading-8 text-orange-700">
                      {
                        completionPrompts[
                          currentVerse
                            .reference
                        ]
                      }
                    </p>

                    <p className="mt-5 text-lg font-semibold text-gray-700">
                      Finish the verse,
                      then give the
                      reference.
                    </p>
                  </>
                )}

              {currentQuestion.mode ===
                "book" &&
                currentVerse && (
                  <>
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                      Find the book
                    </p>

                    <p className="mt-5 text-4xl font-black text-green-700">
                      {currentVerse.reference}
                    </p>

                    <p className="mt-6 text-lg font-semibold text-gray-700">
                      Find the book and
                      say its name.
                    </p>
                  </>
                )}

              {currentQuestion.mode ===
                "keypassage" &&
                currentPassage && (
                  <>
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                      Find the key passage
                    </p>

                    <p className="mt-5 text-4xl font-black text-blue-700">
                      {currentPassage.name}
                    </p>

                    <p className="mt-6 text-lg font-semibold text-gray-700">
                      Find it, then say
                      the passage name
                      and reference.
                    </p>
                  </>
                )}

              <p className="mt-8 text-2xl font-black text-gray-800">
                Get Ready...
              </p>
            </div>
          )}

        {stage === "question" &&
          countdown !== null && (
            <div className="mt-8 rounded-2xl bg-blue-50 p-8 text-center">
              <p className="text-xl font-bold text-gray-800">
                Get Ready!
              </p>

              <p className="mt-4 text-8xl font-black text-blue-700">
                {countdown}
              </p>
            </div>
          )}

        {stage === "listening" && (
          <div className="mt-8 rounded-2xl bg-green-50 p-7 text-center">
            <p className="text-4xl font-black text-green-700">
              🎤 Listening...
            </p>

            <p className="mt-4 min-h-12 text-lg text-gray-900">
              {spokenText ||
                "Start speaking..."}
            </p>

            <button
              onClick={manualStop}
              className="mt-6 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-black text-white"
            >
              🛑 Done Speaking
            </button>
          </div>
        )}

        {stage === "result" && (
          <div
            className={`mt-8 rounded-2xl p-8 text-center ${
              currentCorrect
                ? "bg-green-50"
                : "bg-red-50"
            }`}
          >
            <p className="text-5xl">
              {currentCorrect
                ? "🎉"
                : "❌"}
            </p>

            <p
              className={`mt-4 text-3xl font-black ${
                currentCorrect
                  ? "text-green-700"
                  : "text-red-700"
              }`}
            >
              {currentCorrect
                ? "Correct!"
                : "Not Quite"}
            </p>

            <p className="mt-3 text-lg font-bold text-gray-800">
              {currentIndex + 1} of{" "}
              {questions.length}
            </p>

            <p className="mt-2 text-sm text-gray-600">
              Moving to the next
              question...
            </p>
          </div>
        )}

        {stage === "finished" && (
          <div className="mt-10">
            <div className="rounded-2xl bg-blue-50 p-8 text-center">
              <p className="text-6xl">
                🏆
              </p>

              <h2 className="mt-4 text-4xl font-black text-blue-700">
                Drill Complete!
              </h2>

              <p className="mt-6 text-6xl font-black text-gray-900">
                {totalCorrect}
                <span className="text-3xl text-gray-500">
                  {" "}
                  / 24
                </span>
              </p>

              <p className="mt-3 text-xl font-bold text-gray-700">
                You got{" "}
                {totalCorrect} out
                of 24 correct!
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-purple-100 p-4">
                  <p className="text-2xl font-black text-purple-700">
                    {
                      questionResults.filter(
                        (result) =>
                          result.mode ===
                            "quotation" &&
                          result.correct
                      ).length
                    }
                  </p>

                  <p className="text-sm font-bold text-purple-800">
                    Quotation
                  </p>
                </div>

                <div className="rounded-xl bg-orange-100 p-4">
                  <p className="text-2xl font-black text-orange-700">
                    {
                      questionResults.filter(
                        (result) =>
                          result.mode ===
                            "completion" &&
                          result.correct
                      ).length
                    }
                  </p>

                  <p className="text-sm font-bold text-orange-800">
                    Completion
                  </p>
                </div>

                <div className="rounded-xl bg-green-100 p-4">
                  <p className="text-2xl font-black text-green-700">
                    {
                      questionResults.filter(
                        (result) =>
                          result.mode ===
                            "book" &&
                          result.correct
                      ).length
                    }
                  </p>

                  <p className="text-sm font-bold text-green-800">
                    Book
                  </p>
                </div>

                <div className="rounded-xl bg-blue-100 p-4">
                  <p className="text-2xl font-black text-blue-700">
                    {
                      questionResults.filter(
                        (result) =>
                          result.mode ===
                            "keypassage" &&
                          result.correct
                      ).length
                    }
                  </p>

                  <p className="text-sm font-bold text-blue-800">
                    Key Passage
                  </p>
                </div>
              </div>

              <p className="mt-6 text-sm font-semibold text-gray-600">
                {completedCount} of 24
                drills completed
              </p>

              <button
                onClick={restartDrill}
                className="mt-8 w-full rounded-xl bg-blue-600 px-4 py-5 text-lg font-black text-white"
              >
                🔄 Take Another Full Drill
              </button>

              <button
                onClick={backHome}
                className="mt-3 w-full rounded-xl bg-gray-200 px-4 py-4 text-lg font-bold text-gray-900"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
