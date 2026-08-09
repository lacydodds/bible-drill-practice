"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redCycle } from "@/data/redCycle";

export default function VersesPage() {
const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
const router = useRouter();

function toggleVerse(number: number) {
setSelectedVerses((current) =>
current.includes(number)
? current.filter((item) => item !== number)
: [...current, number]
);
}

function selectAll() {
setSelectedVerses(
redCycle.map((verse) => verse.number)
);
}

function startPractice() {
if (selectedVerses.length === 0) {
alert("Please select at least one verse.");
return;
}

router.push(
  `/practice?verses=${selectedVerses.join(",")}&mode=study`
);

}

function startQuotation() {
if (selectedVerses.length === 0) {
alert("Please select at least one verse.");
return;
}

router.push(
  `/practice?verses=${selectedVerses.join(",")}&mode=quotation`
);

}

function startCompletion() {
if (selectedVerses.length === 0) {
alert("Please select at least one verse.");
return;
}

router.push(
  `/practice?verses=${selectedVerses.join(",")}&mode=completion`
);

}

return (
<main className="min-h-screen bg-white px-4 py-6">
<div className="mx-auto max-w-2xl">

    {/* Header */}
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-gray-900">
        📖 Choose Your Verses
      </h1>

      <button
        onClick={() => router.push("/")}
        className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-bold text-gray-900"
      >
        ← Home
      </button>
    </div>

    {/* Cycle information */}
    <h2 className="mt-3 text-center text-lg font-semibold text-gray-800">
      Red Cycle - King James Version
    </h2>

    <p className="mt-2 text-center text-base font-semibold text-gray-800">
      Selected: {selectedVerses.length} of {redCycle.length}
    </p>

    {/* Select All */}
    <div className="mt-4 flex justify-center">
      <button
        onClick={selectAll}
        className="rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white"
      >
        Select All
      </button>
    </div>

    {/* Verse Selection */}
    <div className="mt-4 grid grid-cols-2 gap-2">

      {/* Left Column: 1-12 */}
      <div className="space-y-2">
        {redCycle
          .filter((verse) => verse.number <= 12)
          .map((verse) => (
            <label
              key={verse.number}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 ${
                selectedVerses.includes(verse.number)
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedVerses.includes(
                  verse.number
                )}
                onChange={() =>
                  toggleVerse(verse.number)
                }
                className="h-4 w-4 shrink-0"
              />

              <span className="text-sm font-medium leading-5 text-gray-900">
                {verse.number}. {verse.reference}
              </span>
            </label>
          ))}
      </div>

      {/* Right Column: 13-25 */}
      <div className="space-y-2">
        {redCycle
          .filter((verse) => verse.number >= 13)
          .map((verse) => (
            <label
              key={verse.number}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 ${
                selectedVerses.includes(verse.number)
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedVerses.includes(
                  verse.number
                )}
                onChange={() =>
                  toggleVerse(verse.number)
                }
                className="h-4 w-4 shrink-0"
              />

              <span className="text-sm font-medium leading-5 text-gray-900">
                {verse.number}. {verse.reference}
              </span>
            </label>
          ))}
      </div>

    </div>

    {/* Practice Buttons */}
    <div className="mt-5 space-y-2">

      <button
        onClick={startPractice}
        className="w-full rounded-xl bg-green-600 px-4 py-3 text-base font-bold text-white"
      >
        📚 Start Practice
      </button>

      <button
        onClick={startQuotation}
        className="w-full rounded-xl bg-purple-600 px-4 py-3 text-base font-bold text-white"
      >
        🏆 Quotation Mode Test
      </button>

      <button
        onClick={startCompletion}
        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-base font-bold text-white"
      >
        ✏️ Completion Mode Test
      </button>

    </div>

  </div>
</main>

);
}