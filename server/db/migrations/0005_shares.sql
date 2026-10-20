CREATE TABLE "share" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"item_id" text NOT NULL,
	"token" text NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"max_downloads" integer,
	"downloads" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "share_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_owner_idx" ON "share" USING btree ("owner_id");