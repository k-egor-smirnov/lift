-- Add note column to tasks table
ALTER TABLE tasks ADD COLUMN note TEXT;
COMMENT ON COLUMN tasks.note IS 'Optional note for the task';
