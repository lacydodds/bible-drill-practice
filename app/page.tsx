export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold mb-4">
        📖 Bible Drill Practice
      </h1>

      <p className="text-lg mb-8">
        "Thy word have I hid in mine heart..."
        <br />
        Psalm 119:11
      </p>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button className="rounded-lg bg-blue-600 text-white p-4 text-lg">
          Select Verses
        </button>

        <button className="rounded-lg bg-green-600 text-white p-4 text-lg">
          Practice Random Verse
        </button>
      </div>

      <p className="mt-10 text-sm">
        Red Cycle • King James Version • 25 Memory Verses
      </p>
    </main>
  );
}