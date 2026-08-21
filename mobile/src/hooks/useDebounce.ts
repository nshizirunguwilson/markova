import { useEffect, useState } from 'react';

/**
 * Holds a value still until it stops changing.
 *
 * Used by every search field in the app. Without it, typing "Uwase" fires five
 * requests and the list flickers through five answers, which on a slow
 * connection means the person watches their own typing arrive out of order.
 *
 * 300ms is the usual figure and it holds up here: fast enough that the list
 * feels tied to the keyboard, slow enough that an average typist never
 * triggers a request mid word.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
