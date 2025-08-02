-- Миграция для изменения типа id с UUID на TEXT для поддержки ULID
-- Миграция 20250802180000: Изменение типа идентификаторов

-- Отключаем RLS временно
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_selection_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata DISABLE ROW LEVEL SECURITY;

-- Удаляем внешние ключи
ALTER TABLE daily_selection_entries DROP CONSTRAINT daily_selection_entries_task_id_fkey;
ALTER TABLE task_logs DROP CONSTRAINT task_logs_task_id_fkey;

-- Изменяем тип id в таблице tasks
ALTER TABLE tasks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- Изменяем тип task_id в связанных таблицах
ALTER TABLE daily_selection_entries ALTER COLUMN task_id TYPE TEXT USING task_id::TEXT;
ALTER TABLE task_logs ALTER COLUMN task_id TYPE TEXT USING task_id::TEXT;

-- Изменяем тип id в других таблицах
ALTER TABLE daily_selection_entries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE daily_selection_entries ALTER COLUMN id TYPE TEXT USING id::TEXT;

ALTER TABLE task_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE task_logs ALTER COLUMN id TYPE TEXT USING id::TEXT;

ALTER TABLE user_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE user_settings ALTER COLUMN id TYPE TEXT USING id::TEXT;

ALTER TABLE sync_metadata ALTER COLUMN id DROP DEFAULT;
ALTER TABLE sync_metadata ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- Восстанавливаем внешние ключи
ALTER TABLE daily_selection_entries ADD CONSTRAINT daily_selection_entries_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_logs ADD CONSTRAINT task_logs_task_id_fkey 
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- Включаем RLS обратно
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_selection_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;