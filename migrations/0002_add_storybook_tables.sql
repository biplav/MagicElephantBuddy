
-- Add books table for storybook feature
CREATE TABLE IF NOT EXISTS "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"genre" text,
	"age_range" text,
	"description" text,
	"cover_image_url" text,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add pages table for individual book pages
CREATE TABLE IF NOT EXISTS "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"page_number" integer NOT NULL,
	"image_url" text NOT NULL,
	"page_text" text NOT NULL,
	"audio_url" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint for pages table
ALTER TABLE "pages" 
ADD CONSTRAINT IF NOT EXISTS "pages_book_id_books_id_fk" 
FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") 
ON DELETE CASCADE ON UPDATE NO ACTION;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "books_title_idx" ON "books" ("title");
CREATE INDEX IF NOT EXISTS "books_age_range_idx" ON "books" ("age_range");
CREATE INDEX IF NOT EXISTS "books_genre_idx" ON "books" ("genre");
CREATE INDEX IF NOT EXISTS "books_is_active_idx" ON "books" ("is_active");

CREATE INDEX IF NOT EXISTS "pages_book_id_idx" ON "pages" ("book_id");
CREATE INDEX IF NOT EXISTS "pages_page_number_idx" ON "pages" ("page_number");

-- Add unique constraint to ensure page numbers are unique within a book
CREATE UNIQUE INDEX IF NOT EXISTS "pages_book_id_page_number_unique" ON "pages" ("book_id", "page_number");
