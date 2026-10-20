ALTER TABLE "item" ADD COLUMN "trash_entry_id" text;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "trashed_from" jsonb;--> statement-breakpoint
-- Files replaced before Trash existed: each becomes its own entry, restored to its Folder.
UPDATE "item" SET "trash_entry_id" = "id" WHERE "trashed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "item_trash_entry_idx" ON "item" USING btree ("trash_entry_id") WHERE "item"."trash_entry_id" is not null;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_trash_entry_set" CHECK (("item"."trashed_at" is null) = ("item"."trash_entry_id" is null));