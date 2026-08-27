import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
}

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-accent text-primary",
    // A solid fill in the school's own colour, with text picked to read on it.
    primary: "bg-primary text-on-primary",
    success: "bg-success-wash text-success",
    warning: "bg-warning-wash text-warning",
    danger: "bg-danger-wash text-danger",
    info: "bg-accent-light text-primary",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
