
-- Add captured_frames table for video frame storage and analysis
CREATE TABLE IF NOT EXISTS "captured_frames" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"frame_data" text NOT NULL,
	"analysis" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "captured_frames" ADD CONSTRAINT "captured_frames_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "captured_frames" ADD CONSTRAINT "captured_frames_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "captured_frames_child_id_idx" ON "captured_frames" ("child_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captured_frames_conversation_id_idx" ON "captured_frames" ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captured_frames_created_at_idx" ON "captured_frames" ("created_at");
