import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Motion, and the right to switch it off.
 *
 * Two findings from the research changed what was here before.
 *
 * The first is asymmetry. Nielsen Norman's work on animation duration is
 * explicit that a thing arriving needs slightly longer than the same thing
 * leaving, roughly 300ms in against 200 to 250ms out, because the eye needs
 * time to find something that has appeared and needs no time at all to let go
 * of something that has gone. The old tokens were one duration used both ways,
 * which makes entrances feel abrupt and exits feel sluggish at the same time.
 *
 * The second is that none of this is optional. WCAG 2.3.3 covers animation
 * triggered by interaction, and both platforms expose a system setting for it.
 * Motion that cannot be turned off can cause dizziness, nausea and headaches
 * in people with vestibular disorders, and an infinite pulse like the skeleton
 * loader is exactly the kind of thing that does it. So every animated thing in
 * the app asks first.
 *
 * Sources are listed in docs/mobile-design-system.md.
 */

export const duration = {
  /** A control acknowledging a touch. Feels like moving a physical object. */
  feedback: 100,
  /** Something arriving. Longer, because the eye has to find it. */
  enter: 280,
  /** Something leaving. Shorter, because it does not need following. */
  exit: 200,
  /** A whole screen or sheet moving. NN/G puts the ceiling at 400. */
  screen: 360,
} as const;

/**
 * Curves, in the direction the research says.
 *
 * Decelerating on the way in so the element settles rather than slams.
 * Accelerating on the way out so it commits to leaving. Never linear, which
 * reads as mechanical because nothing in the physical world moves that way.
 */
export const easing = {
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  move: [0.4, 0, 0.2, 1] as const,
} as const;

/**
 * Whether this person has asked the system for less motion.
 *
 * Reads the setting once and then listens, because it can be toggled while the
 * app is open and a person who turns it on mid session did so for a reason.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/**
 * A duration that collapses to nothing when motion is turned down.
 *
 * Zero rather than a small number, because the guidance is to remove the
 * animation, not to perform it quickly. A fast animation is still an animation.
 */
export const withReducedMotion = (reduced: boolean, ms: number) => (reduced ? 0 : ms);
