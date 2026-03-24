export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Salesbot</h1>
        <p className="text-xl text-gray-600 mb-8">
          Automated Sales Prospecting Bot
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8">
          <p className="text-gray-700">
            Welcome! Your Next.js + Tailwind + TypeScript project is ready.
          </p>
        </div>
      </div>
    </main>
  );
}

export const metadata = {
  title: "Dashboard",
};
