/*
  Warnings:

  - You are about to drop the column `priority_checklist` on the `scans` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "frameworks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "scan_pages" ADD COLUMN     "raw_html" TEXT;

-- AlterTable
ALTER TABLE "scans" DROP COLUMN "priority_checklist",
ADD COLUMN     "domain" VARCHAR(255) NOT NULL DEFAULT '',
ADD COLUMN     "ssl_info" JSONB;
