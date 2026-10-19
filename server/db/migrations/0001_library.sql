CREATE TABLE "blob" (
	"hash" text PRIMARY KEY NOT NULL,
	"size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"blob_hash" text,
	"size" bigint,
	"mime_type" text,
	"trashed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_file_has_blob" CHECK (("item"."kind" = 'folder' and "item"."blob_hash" is null) or ("item"."kind" = 'file' and "item"."blob_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_parent_id_item_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_blob_hash_blob_hash_fk" FOREIGN KEY ("blob_hash") REFERENCES "public"."blob"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_sibling_name_uq" ON "item" USING btree ("owner_id",coalesce("parent_id", ''),lower("name")) WHERE "item"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX "item_owner_parent_idx" ON "item" USING btree ("owner_id","parent_id");--> statement-breakpoint
CREATE INDEX "item_blob_idx" ON "item" USING btree ("blob_hash");