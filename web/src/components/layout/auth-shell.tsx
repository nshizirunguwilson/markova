"use client";

import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { useBrandStore } from "@/stores/brand-store";

interface AuthShellProps {
  /** Heading under the mark. Defaults to the school name. */
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * The frame every unauthenticated screen sits in.
 *
 * Deliberately mirrors the mobile auth screens: brand-navy ground, white card,
 * logo mark, school name, one-line subtitle. The two platforms previously
 * inverted each other — web put a white shield on navy inside a pale card while
 * mobile put a blue letter on white against navy — so signing in looked like
 * two different products. Both now render the same composition.
 */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const schoolName = useBrandStore((s) => s.schoolName);

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-primary to-primary-dark p-4">
      <Card className="w-full max-w-md" padding="lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} className="mb-4" />
          <h1 className="text-xl md:text-2xl font-bold text-primary text-balance">
            {title ?? schoolName}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </Card>
    </div>
  );
}
