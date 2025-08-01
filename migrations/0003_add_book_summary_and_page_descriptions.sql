
-- Add summary column to books table
ALTER TABLE "books" ADD COLUMN "summary" text;

-- Add image_description column to pages table  
ALTER TABLE "pages" ADD COLUMN "image_description" text;

-- Add index for book summary searches
CREATE INDEX IF NOT EXISTS "books_summary_idx" ON "books" ("summary");
