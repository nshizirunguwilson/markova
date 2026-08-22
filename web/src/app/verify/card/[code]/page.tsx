import type { Metadata } from "next";
import { ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";
import { resolveUploadUrl } from "@/lib/assets";

export const metadata: Metadata = {
  title: "Card Verification | Markova",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

interface CardCheck {
  valid: boolean;
  reason: string | null;
  student?: {
    name: string;
    studentIdNumber: string;
    level: string | null;
    photoUrl: string | null;
    status: string;
  };
  issuedAt?: string | null;
}

async function fetchCard(code: string): Promise<CardCheck | null> {
  try {
    const res = await fetch(`${API}/verify/card/${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CardCheck;
  } catch {
    return null;
  }
}

/**
 * Public page: scan the QR on a student's ID card and land here.
 *
 * The photo is the point. A printed card can always be photocopied, so what
 * catches a copy is not the code but the face: this page shows the photo the
 * school holds, and whoever is checking compares it with the person in front
 * of them. The code only proves the card is one the school really issued.
 */
export default async function VerifyCardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const check = await fetchCard(code);

  // Unreachable API and an unknown code are different problems, and telling a
  // gate they are the same would have someone turn a student away over a
  // network fault.
  if (!check) {
    return (
      <Shell
        tone="unknown"
        icon={<ShieldAlert className="h-7 w-7 text-warning" />}
        title="Could not check this card"
        body="The school's system could not be reached. This does not mean the card is fake; try again in a moment."
        code={code}
      />
    );
  }

  if (!check.student) {
    return (
      <Shell
        tone="invalid"
        icon={<ShieldX className="h-7 w-7 text-danger" />}
        title="Not a valid card"
        body={check.reason ?? "This card was not issued by this school."}
        code={code}
      />
    );
  }

  const { student } = check;
  const photo = resolveUploadUrl(student.photoUrl);

  return (
    <Shell
      tone={check.valid ? "valid" : "invalid"}
      icon={
        check.valid ? (
          <ShieldCheck className="h-7 w-7 text-success" />
        ) : (
          <ShieldX className="h-7 w-7 text-danger" />
        )
      }
      title={check.valid ? "Valid student card" : "Card is not current"}
      body={
        check.reason ??
        "Compare the photo below with the person holding the card."
      }
      code={code}
    >
      <div className="mt-6 flex items-center gap-5 rounded-xl border border-border bg-surface-muted p-5 text-left">
        <div className="h-28 w-21 shrink-0 overflow-hidden rounded-lg bg-accent">
          {photo ? (
            /* eslint-disable-next-line @next/next/no-img-element -- runtime upload on the API origin */
            <img
              src={photo}
              alt={`Photo of ${student.name}`}
              className="h-28 w-21 object-cover"
            />
          ) : (
            <div className="flex h-28 w-21 items-center justify-center text-2xl font-bold text-primary">
              {student.name
                .split(" ")
                .slice(0, 2)
                .map((p) => p[0])
                .join("")}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-foreground">{student.name}</p>
          <p className="mt-1 font-mono text-sm text-foreground-muted">
            {student.studentIdNumber}
          </p>
          {student.level && (
            <p className="mt-1 text-sm text-muted">{student.level}</p>
          )}
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
            {student.status}
          </p>
        </div>
      </div>

      <p className="mt-5 text-xs text-muted">
        A card can be photocopied; a face cannot. If the photo above does not
        match the person holding this card, it is not theirs.
      </p>
    </Shell>
  );
}

function Shell({
  tone,
  icon,
  title,
  body,
  code,
  children,
}: {
  tone: "valid" | "invalid" | "unknown";
  icon: React.ReactNode;
  title: string;
  body: string;
  code: string;
  children?: React.ReactNode;
}) {
  const wash =
    tone === "valid"
      ? "bg-success-wash"
      : tone === "invalid"
        ? "bg-danger-wash"
        : "bg-warning-wash";

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent-light p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-card">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${wash}`}
        >
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
        {children}
        <p className="mt-6 font-mono text-xs text-muted">{code}</p>
      </div>
    </div>
  );
}
