import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    // Without an id the label points at nothing, so the field has no
    // accessible name and screen readers announce it as unlabelled. Callers
    // usually pass one; this is the fallback for the ones that do not.
    const generated = useId();
    const inputId = id ?? generated;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-lg border border-input bg-field px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-surface",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-danger focus:ring-danger/50",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
