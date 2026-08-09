"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            📖 Bible Drill Practice
          </h1>

          <p className="mt-4 text-lg italic text-gray-700">
            "Thy word have I hid in mine heart..."
          </p>

          <p className="mt-1 text-lg font-semibold text-blue-700">
            Psalm 119:11
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <button
            onClick={() => router.push("/verses")}
            className="rounded-2xl bg-green-600 px-5 py-5 text-xl font-bold text-white shadow"
          >
            📖 Quotation / Completion Drills
          </button>

          <button
            onClick={() =>
              router.push("/book-drill")
            }
            className="rounded-2xl bg-blue-600 px-5 py-5 text-xl font-bold text-white shadow"
          >
            📚 Book Drill
          </button>

          <button
            onClick={() =>
              router.push("/key-passage-drill")
            }
            className="rounded-2xl bg-purple-600 px-5 py-5 text-xl font-bold text-white shadow"
          >
            🔑 Key Passage Drill
          </button>

          <button
            disabled
            className="rounded-2xl bg-gray-300 px-5 py-5 text-xl font-bold text-gray-600"
          >
            🏆 Full Bible Drill
            <span className="mt-1 block text-sm font-normal">
              Coming next
            </span>
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Red Cycle • King James Version • 25 Memory Verses
        </p>
      </div>
    </main>
  );
}