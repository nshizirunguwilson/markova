import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-muted flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-8xl font-bold text-primary">404</p>
        <h1 className="mt-4 text-xl md:text-2xl font-semibold text-foreground">
          Page Not Found
        </h1>
        <p className="mt-2 text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
