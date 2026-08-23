-- A suspended card keeps its code and can be brought back; a revoked one has
-- its code destroyed and needs reissuing.
ALTER TABLE "students" ADD COLUMN "card_suspended_at" TIMESTAMP(3);
