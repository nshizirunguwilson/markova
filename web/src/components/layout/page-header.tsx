import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Usually a plain string; accepts nodes so pages can greet by name. */
  title: React.ReactNode;
  /** One line of context under the title — a count, a scope, a hint. */
  description?: React.ReactNode;
  /** Actions aligned to the trailing edge: export buttons, status badges, CTAs. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The title block every dashboard page opens with.
 *
 * Page titles used to be hand-rolled 59 times, which is how three different
 * heading colours ended up in the app: 35 pages on `text-foreground`, 14
 * hardcoding the brand hex, 3 on `text-primary`. The hardcoded ones ignored
 * BrandProvider entirely, so a school with its own colour still got Markova
 * navy on those pages. One component, one answer.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold text-foreground text-balance">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
