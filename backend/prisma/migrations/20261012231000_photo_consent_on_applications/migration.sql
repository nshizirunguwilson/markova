-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "photo_for_id" "PhotoAnswer" NOT NULL DEFAULT 'NOT_ASKED',
ADD COLUMN     "photo_in_app" "PhotoAnswer" NOT NULL DEFAULT 'NOT_ASKED',
ADD COLUMN     "photo_publicity" "PhotoAnswer" NOT NULL DEFAULT 'NOT_ASKED';

