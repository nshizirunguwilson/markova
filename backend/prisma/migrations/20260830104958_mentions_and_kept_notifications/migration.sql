-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "message_mentions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "via_everyone" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_mentions_user_id_idx" ON "message_mentions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_mentions_message_id_user_id_key" ON "message_mentions"("message_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_related_entity_type_related_e_idx" ON "notifications"("user_id", "is_read", "related_entity_type", "related_entity_id");

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
