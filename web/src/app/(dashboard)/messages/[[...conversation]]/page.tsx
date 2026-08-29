/**
 * The chat, at `/messages` and at `/messages/<conversation id>`.
 *
 * One optional catch-all rather than a page and a nested route, because two
 * separate route files meant two separate React trees: opening a thread
 * unmounted the inbox and mounted a fresh copy of the same screen, and the
 * whole conversation flashed as it was rebuilt. Sharing one file keeps the
 * component mounted and only the parameter changes.
 *
 * The screen itself lives outside the route tree so that every role can point
 * its own path at it without one of them owning the file.
 */
export { default } from "@/components/messaging/messages-screen";
