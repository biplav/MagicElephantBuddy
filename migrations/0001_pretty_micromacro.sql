CREATE TABLE "captured_frames" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"conversation_id" integer,
	"frame_data" text NOT NULL,
	"analysis" text NOT NULL,
	"reason" text,
	"looking_for" text,
	"context" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"importance" double precision DEFAULT 0.5,
	"embedding" vector(1536),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_child_contexts" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"active_memory_ids" text[],
	"context_vector" text,
	"personality_profile" json,
	"learning_style" json,
	"relationship_level" double precision DEFAULT 0,
	"active_interests" text[],
	"emotional_state" text,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_conversation_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"memory_id" text NOT NULL,
	"relevance_score" double precision DEFAULT 0.5,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"pattern" text NOT NULL,
	"description" text NOT NULL,
	"confidence" double precision DEFAULT 0.5,
	"recommendations" text[],
	"supporting_memory_ids" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "captured_frames" ADD CONSTRAINT "captured_frames_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captured_frames" ADD CONSTRAINT "captured_frames_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_child_contexts" ADD CONSTRAINT "memory_child_contexts_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_conversation_links" ADD CONSTRAINT "memory_conversation_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_conversation_links" ADD CONSTRAINT "memory_conversation_links_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_insights" ADD CONSTRAINT "memory_insights_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;