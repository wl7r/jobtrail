CREATE TABLE "search_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sites" "JobSource"[] NOT NULL,
    "search_term" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "hours_old" INTEGER,
    "is_remote" BOOLEAN NOT NULL,
    "job_type" "JobType",
    "include_keywords" TEXT NOT NULL,
    "exclude_keywords" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "search_presets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "search_presets_name_key" ON "search_presets"("name");
