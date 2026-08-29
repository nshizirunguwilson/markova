/**
 * One conversation, addressed by its own id.
 *
 * The thread used to live in a query string — `/messages?conversation=<id>` —
 * which made every conversation the same page wearing a parameter. A thread
 * is a thing you link somebody to, reload, and come back to from a
 * notification, and all three want a real address.
 *
 * The page itself is shared: it reads the id from the route and opens that
 * conversation, and `/messages` with no id is the same page with none open.
 */
export { default } from "@/app/(dashboard)/messages/page";
