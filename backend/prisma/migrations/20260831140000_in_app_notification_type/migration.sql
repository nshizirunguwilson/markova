-- The bell in the dashboard is its own kind of notice.
--
-- It is written down, shown when somebody next looks, and never sent anywhere.
-- Without a value for it, anything meant only for the bell was recorded as
-- EMAIL or PUSH, which made the record wrong in a way that matters: a row
-- saying EMAIL is a claim that a message was sent, and somebody chasing "did
-- they ever hear about this" could not tell the two apart.
--
-- Added rather than replacing anything, so every existing row stays valid.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'IN_APP';
