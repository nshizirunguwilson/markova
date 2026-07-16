import type { Metadata } from "next";
import { ShieldCheck, ShieldX } from "lucide-react";
import { A4Preview } from "@/components/a4-preview";

export const metadata: Metadata = {
  title: "Report Verification | Markova",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

async function fetchReport(code: string) {
  try {
    const res = await fetch(`${API}/verify/${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Public page: anyone holding a printed report card scans its QR (or types
// the link) and lands here to compare the paper with the digital original.
export default async function VerifyReportPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const report = await fetchReport(code);

  if (!report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent-light p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <ShieldX className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            No report found for this code
          </h1>
          <p className="mt-2 text-sm text-muted">
            The code <span className="font-medium text-foreground">{code}</span>{" "}
            does not match any report issued by this school. The printed copy
            you are holding should be treated as invalid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-accent-light px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50">
            <ShieldCheck className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">
              Verified report
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Code <span className="font-medium text-foreground">{report.verification?.code}</span>{" "}
              belongs to {report.student?.name} ({report.student?.class},{" "}
              {report.term?.name} {report.term?.academicYear}). Below is the
              digital original. A printed copy is valid only if it matches this
              document exactly.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-3 shadow-card">
          <A4Preview
            html={report.html}
            title="Digital original of the report card"
          />
        </div>
      </div>
    </div>
  );
}
