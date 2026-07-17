-- AlterTable
ALTER TABLE "users" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_code_key" ON "users"("code");

