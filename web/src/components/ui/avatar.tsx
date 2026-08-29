import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/lib/assets";
import { User } from "lucide-react";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  fallback?: string;
  className?: string;
}

export function Avatar({
  src,
  alt = "",
  size = "md",
  fallback,
  className,
}: AvatarProps) {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-7 w-7",
  };

  // API-stored photos are root-relative (/uploads/...) and live on the API
  // origin, not the web one - resolve before rendering.
  const resolved = resolveUploadUrl(src);

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={cn(
          "rounded-full object-cover border border-border",
          sizes[size],
          className
        )}
      />
    );
  }

  // No photograph: their initials, or the placeholder for a row with no
  // person behind it at all.
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-accent text-primary font-medium border border-border",
        sizes[size],
        className
      )}
    >
      {fallback ? (
        fallback.slice(0, 2).toUpperCase()
      ) : (
        <User className={iconSizes[size]} />
      )}
    </div>
  );
}
