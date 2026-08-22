-- The code printed on a student's ID card as a QR. Unguessable, and cleared
-- when the card is revoked, so a lost card stops verifying once reissued.
ALTER TABLE "students" ADD COLUMN "card_code" TEXT;

CREATE UNIQUE INDEX "students_card_code_key" ON "students"("card_code");
