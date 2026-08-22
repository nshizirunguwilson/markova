/**
 * Copying text, where copying might not be available.
 *
 * `navigator.clipboard` only exists in a secure context. A school running this
 * over plain http on its own LAN, which is exactly how this product gets
 * deployed, has no clipboard API at all, and reaching for it throws. That
 * mattered on the one screen where it was used: the generated password shown
 * once when an account is created.
 *
 * Falls back to the old selection-based copy, and reports honestly when neither
 * works so the person knows to write it down instead.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused, or a context that claims a clipboard and has none.
      // The fallback below still works in some of those cases.
    }
  }

  if (typeof document === "undefined" || !document.body) return false;

  try {
    const holder = document.createElement("textarea");
    holder.value = text;
    // Kept out of view and out of the tab order, but still selectable.
    holder.setAttribute("readonly", "");
    holder.style.position = "fixed";
    holder.style.top = "-1000px";
    holder.style.opacity = "0";
    document.body.appendChild(holder);
    holder.select();
    const copied = document.execCommand?.("copy") ?? false;
    document.body.removeChild(holder);
    return copied;
  } catch {
    return false;
  }
}
