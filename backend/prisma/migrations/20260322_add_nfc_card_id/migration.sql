-- AlterTable
ALTER TABLE "students" ADD COLUMN "nfc_card_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "students_nfc_card_id_key" ON "students"("nfc_card_id");
