-- Answering a particular message.
--
-- ON DELETE SET NULL rather than CASCADE: a reply is still something somebody
-- said, and removing it because the message above it went would take a real
-- sentence out of the conversation.
ALTER TABLE "messages" ADD COLUMN "reply_to_id" TEXT;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_reply_to_id_fkey"
  FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");
