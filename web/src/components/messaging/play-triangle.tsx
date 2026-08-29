/**
 * A play triangle that sits in the middle of whatever contains it.
 *
 * The usual triangle icons are drawn inside their box so that the *bounding
 * box* is centred, which leaves the shape itself looking left of centre - a
 * triangle's weight is toward its base, not its tip. Every icon set works
 * around this the same way, by nudging it right with a margin, and every
 * nudge is somebody's guess: ours was 4px on a 24px icon, which overshot and
 * left the arrow sitting right and high inside its circle.
 *
 * This one is centred by construction instead. For a triangle with its base
 * at x = B and its tip at x = X, the centroid sits at (2B + X) / 3; put that
 * at 12 and the shape balances on the middle of a 24-unit box with no margin
 * to tune. Vertically the base is symmetrical about 12, so it centres for
 * free.
 *
 *     base at 9, tip at 18  →  (9 + 9 + 18) / 3 = 12  ✓
 */
export function PlayTriangle({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 6 L18 12 L9 18 Z" />
    </svg>
  );
}
