"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { displayableError } from "@/lib/error-display";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md text-center" padding="lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-wash">
          <AlertTriangle className="h-7 w-7 text-danger" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-muted mb-6">
          {displayableError(error).message}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            Try Again
          </button>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent-light transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </Card>
    </div>
  );
}
