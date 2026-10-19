CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "preview" (
	"blob_hash" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preview" ADD CONSTRAINT "preview_blob_hash_blob_hash_fk" FOREIGN KEY ("blob_hash") REFERENCES "public"."blob"("hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_due_idx" ON "job" USING btree ("run_at") WHERE "job"."failed_at" is null;