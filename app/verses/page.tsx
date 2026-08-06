import { redCycle } from "@/data/redCycle";

export default function VersesPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-6">
        📖 Choose Your Verses
      </h1>

      <h2 className="text-xl mb-4">
        Red Cycle - King James Version
      </h2>

      <div className="flex flex-col gap-3">
        {redCycle.map((verse) => (
          <label
            key={verse.number}
            className="flex items-center gap-3 rounded-lg border p-4"
          >
            <input
              type="checkbox"
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