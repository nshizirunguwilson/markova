/**
 * Shared shapes for the mutation hooks.
 *
 * These endpoints accept a wide, evolving set of fields and the server owns the
 * schema, so the hooks do not restate it. `unknown` values keep callers honest
 * without pretending this layer validates anything: it does not, the API does.
 * That is still a great deal safer than `any`, which silently disabled checking
 * on everything downstream of it.
 */

/** A request body: named fields whose types the API, not this layer, decides. */
export type Payload = Record<string, unknown>;

/** A request body that also identifies the record it updates. */
export type PayloadWithId = Payload & { id: string };

/**
 * The parts of a loan response the success toast names. Everything is optional
 * because the toast is decoration: it must never be the reason a completed
 * checkout is reported to the user as a failure.
 */
export type LoanResponse = {
  book?: { title?: string };
  borrower?: { firstName?: string };
};

/** The parts of a scan response the success toast names. */
export type ScanResponse = {
  duplicate?: boolean;
  student?: { name?: string };
  record?: { status?: string };
};

/** The count a bulk save reports back. */
export type BulkSaveResponse = { count?: number };
