/**
 * Where this browser keeps the sign in.
 *
 * On somebody's own computer, in local storage, so it survives closing the
 * browser. On a shared computer (a school lab, a cyber café: B5 in
 * docs/BLIND-SPOTS.md), in session storage, so closing the browser signs the
 * person out and the next student who opens it finds nothing. The server
 * says which it is when the sign in begins; every other place in the app
 * asks here rather than reading storage itself.
 */

const ACCESS = "access_token";
const REFRESH = "refresh_token";
/** Kept in session storage: set only for a sign in on a shared computer. */
const SHARED = "markova_shared_device";

const safe = <T,>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

/** Whether this tab's sign in is on a shared computer. */
export function isShared(): boolean {
  if (typeof window === "undefined") return false;
  return safe(() => sessionStorage.getItem(SHARED) === "1", false);
}

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  return safe(() => (isShared() ? sessionStorage : localStorage), null);
}

export function accessToken(): string | null {
  return safe(() => store()?.getItem(ACCESS) ?? null, null);
}

export function refreshToken(): string | null {
  return safe(() => store()?.getItem(REFRESH) ?? null, null);
}

/** A new pair, from a refresh or a change of school: kept where the old one was. */
export function keepTokens(pair: { accessToken: string; refreshToken: string }) {
  safe(() => {
    store()?.setItem(ACCESS, pair.accessToken);
    store()?.setItem(REFRESH, pair.refreshToken);
  }, undefined);
}

/** The start of a sign in: on a shared computer or not, as the server said. */
export function beginSession(pair: {
  accessToken: string;
  refreshToken: string;
  sharedDevice?: boolean;
}) {
  forgetTokens();
  safe(() => {
    if (pair.sharedDevice) sessionStorage.setItem(SHARED, "1");
    else sessionStorage.removeItem(SHARED);
  }, undefined);
  keepTokens(pair);
}

/** Forget the sign in, wherever it was kept. */
export function forgetTokens() {
  if (typeof window === "undefined") return;
  safe(() => {
    for (const s of [localStorage, sessionStorage]) {
      s.removeItem(ACCESS);
      s.removeItem(REFRESH);
    }
    sessionStorage.removeItem(SHARED);
  }, undefined);
}
