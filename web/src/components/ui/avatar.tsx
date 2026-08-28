import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/lib/assets";
import { generatedAvatar } from "@/lib/avatar";
import { User } from "lucide-react";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  fallback?: string;
  className?: string;
  /**
   * The person's id. Given one, somebody with no photograph gets a drawn
   * face of their own rather than their initials — generated locally and
   * always the same for the same person.
   */
  seed?: string | null;
}

export function Avatar({
  src,
  alt = "",
  size = "md",
  fallback,
  className,
  seed,
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
  // origin, not the web one — resolve before rendering.
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

  /*
    No photograph. A drawn face, if we know who this is — a school register
    of fourteen hundred rows of "AU" and "AM" is a wall of initials nobody
    can read down. Same person, same face, every time.
  */
  const drawn = generatedAvatar(seed);
  if (drawn) {
    return (
      <img
        src={drawn}
        alt={alt}
        className={cn(
          "rounded-full border border-border bg-accent object-cover",
          sizes[size],
          className
        )}
      />
    );
  }

  // Nobody in particular: initials, or the placeholder that has always been
  // here for a row with no person behind it at all.
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
