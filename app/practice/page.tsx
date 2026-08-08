"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { redCycle } from "@/data/redCycle";


export default function PracticePage() {
  const searchParams = useSearchParams();

const selectedNumbers = searchParams
  .get("verses")
  ?.split(",")
  .map(Number)
  .filter(Boolean) ?? [];
  
const practiceVerses = redCycle.filter((verse) =>
  selectedNumbers.includes(verse.number)
);
const [mode, setMode] = useState<"study" | "test">("study");
  const [currentVerse, setCurrentVerse] = useState(0);

  function nextVerse() {
    setCurrentVerse((current) =>
      current + 1 < practiceVerses.length ? current + 1 : 0
    );
  }

  return (
    <main className="min-h-screen bg-blue-50 p-8">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-center text-blue-900">
          📖 Bible Drill Practice
        </h1>

        <p className="mt-4 text-center text-lg text-gray-800">
          ⭐ Verse {currentVerse + 1} of {practiceVerses.length}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
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
        <div className="mt-8 rounded-xl bg-yellow-200 p-6 text-center">
  <h2 className="text-2xl font-bold text-gray-900">
    {practiceVerses[currentVerse]?.reference}
  </h2>

  {mode === "study" && (
  <p className="mt-4 text-lg font-semibold text-gray-900">
    {practiceVerses[currentVerse]?.text}
  </p>
)}
</div>

        <p className="mt-6 text-center text-lg font-semibold text-gray-900">
  Say the verse out loud!
</p>

        <div className="mt-8 flex flex-col gap-3">
          <button className="rounded-xl bg-green-500 px-4 py-3 text-white font-bold">
            ✅ I got it!
          </button>

          <button className="rounded-xl bg-orange-400 px-4 py-3 text-white font-bold">
            🔄 Try Again
          </button>

          <button
            onClick={nextVerse}
            className="rounded-xl bg-blue-600 px-4 py-3 text-white font-bold"
          >
            ➡️ Next Verse
          </button>
        </div>
      </div>
    </main>
  );
}