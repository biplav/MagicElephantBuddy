
-- Migration to add audioUrl column to pages table if it doesn't exist
-- This ensures compatibility with existing installations

DO $$ BEGIN
    -- Check if audioUrl column already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pages' AND column_name = 'audio_url'
    ) THEN
        -- Add audioUrl column if it doesn't exist
        ALTER TABLE "pages" ADD COLUMN "audio_url" text;
        
        -- Add index for audio URL searches (optional)
        CREATE INDEX IF NOT EXISTS "pages_audio_url_idx" ON "pages" ("audio_url");
        
        -- Log the change
        RAISE NOTICE 'Added audio_url column to pages table';
    ELSE
        RAISE NOTICE 'audio_url column already exists in pages table';
    END IF;
END $$;
