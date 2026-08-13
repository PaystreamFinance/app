DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'paystream_user' 
        AND column_name = 'tncAccepted'
    ) THEN
        ALTER TABLE "paystream_user" ADD COLUMN "tncAccepted" boolean DEFAULT false NOT NULL;
    END IF;
END $$;