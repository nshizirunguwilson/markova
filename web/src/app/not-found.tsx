import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-8xl font-bold text-[#1B4F72]">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">
          Page Not Found
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#1B4F72] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#154360] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/50"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
