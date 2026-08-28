-- The group chat that belongs to a class.
--
-- Nullable: every other conversation has no class. Unique: a class has
-- exactly one group, so a second insert for the same class fails at the
-- database rather than quietly creating a duplicate room.
ALTER TABLE "conversations" ADD COLUMN "class_section_id" TEXT;

CREATE UNIQUE INDEX "conversations_class_section_id_key"
  ON "conversations"("class_section_id");

-- Deleting a class takes its group with it; the messages go by their own
-- cascade from the conversation.
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_class_section_id_fkey"
  FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
