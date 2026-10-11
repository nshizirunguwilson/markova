-- Who watches over the chats between staff and students.
ALTER TABLE "users" ADD COLUMN "safeguarding_lead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversation_participants" ADD COLUMN "watching" BOOLEAN NOT NULL DEFAULT false;
