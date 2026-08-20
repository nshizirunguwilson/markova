"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-surface shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-[#1B4F72] px-4 py-2 text-sm font-medium text-white hover:bg-[#154360] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/50"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
