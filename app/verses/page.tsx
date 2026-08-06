"use client";

import { useState } from "react";
import { redCycle } from "@/data/redCycle";

export default function VersesPage() {
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);

  function toggleVerse(number: number) {
    setSelectedVerses((current) =>
      current.includes(number)
        ? current.filter((item) => item !== number)
        : [...current, number]
    );
  }

  function selectAll() {
    setSelectedVerses(redCycle.map((verse) => verse.number));
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6">
        📖 Choose Your Verses
      </h1>

      <h2 className="text-xl mb-4">
        Red Cycle - King James Version
      </h2>

      <p className="mb-4">
        Selected: {selectedVerses.length} of {redCycle.length}
      </p>

      <button
        onClick={selectAll}
        className="mb-6 rounded-lg bg-black px-4 py-2 text-white"
      >
        Select All
      </button>

      <div className="flex flex-col gap-3">
        {redCycle.map((verse) => (
          <label
            key={verse.number}
            className="flex items-center gap-3 rounded-lg border p-4"
          >
            <input
              type="checkbox"
              checked={selectedVerses.includes(verse.number)}
              onChange={() => toggleVerse(verse.number)}
              className="h-5 w-5"
            />

            <span>
              {verse.number}. {verse.reference}
            </span>
          </label>
        ))}
      </div>
    </main>
  );
}