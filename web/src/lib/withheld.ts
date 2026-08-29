import type { Withheld } from "@/components/finance/withheld-notice";

/** What the API calls a refusal made because the fees are owed. */
export const FEE_REFUSAL_REASON = "FEES_OUTSTANDING";

/**
 * Read a held term out of a failed request.
 *
 * A report card comes back 403 for two quite different reasons - the school
 * has not issued it yet, or the term's fees are owed - and the two need
 * different pages. The API names the second one, so this switches on the name
 * rather than on the wording of a message somebody may one day reword or
 * translate.
 *
 * Returns null for every other error, including an ordinary "not issued"
 * refusal, so a caller can fall through to whatever it showed before.
 */
export function withheldFrom(error: unknown): Withheld | null {
  const body = (
    error as { response?: { data?: Record<string, unknown> } } | null
  )?.response?.data;
  if (!body || body.reason !== FEE_REFUSAL_REASON) return null;

  const detail = body.detail as { balance?: unknown } | undefined;
  return {
    balance: typeof detail?.balance === "number" ? detail.balance : 0,
    message: typeof body.message === "string" ? body.message : "",
  };
}
