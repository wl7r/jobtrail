ALTER TABLE "search_presets"
  ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "running_until" TIMESTAMP(3),
  ADD COLUMN "last_checked_at" TIMESTAMP(3),
  ADD COLUMN "last_errors" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "last_new_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "search_preset_hits" (
  "id" TEXT NOT NULL,
  "preset_id" TEXT NOT NULL,
  "source" "JobSource" NOT NULL,
  "source_job_id" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_preset_hits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_preset_hits_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "search_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "search_preset_hits_preset_id_source_source_job_id_key" ON "search_preset_hits"("preset_id", "source", "source_job_id");
CREATE INDEX "search_preset_hits_preset_id_first_seen_at_idx" ON "search_preset_hits"("preset_id", "first_seen_at");
