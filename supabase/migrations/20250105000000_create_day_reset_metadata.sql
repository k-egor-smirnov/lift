-- Create day_reset_metadata table for managing day reset functionality
CREATE TABLE day_reset_metadata (
    user_id TEXT PRIMARY KEY,
    last_reset_date DATE,
    last_snapshot_id TEXT,
    reset_event_id TEXT NOT NULL,
    last_start_confirmed_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for efficient queries
CREATE INDEX idx_day_reset_metadata_last_reset_date ON day_reset_metadata(last_reset_date);
CREATE INDEX idx_day_reset_metadata_last_start_confirmed_date ON day_reset_metadata(last_start_confirmed_date);

-- Enable RLS
ALTER TABLE day_reset_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own day reset metadata" ON day_reset_metadata
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own day reset metadata" ON day_reset_metadata
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own day reset metadata" ON day_reset_metadata
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own day reset metadata" ON day_reset_metadata
    FOR DELETE USING (auth.uid()::text = user_id);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_day_reset_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_day_reset_metadata_updated_at
    BEFORE UPDATE ON day_reset_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_day_reset_metadata_updated_at();