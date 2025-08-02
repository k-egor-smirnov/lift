-- Добавляем поле deleted_at для soft delete в таблицу daily_selection_entries
ALTER TABLE daily_selection_entries 
ADD COLUMN deleted_at TIMESTAMPTZ;

-- Добавляем индекс для оптимизации запросов с учетом deleted_at
CREATE INDEX idx_daily_selection_deleted_at ON daily_selection_entries(deleted_at);
CREATE INDEX idx_daily_selection_user_date_not_deleted ON daily_selection_entries(user_id, date) WHERE deleted_at IS NULL;

-- Обновляем политики безопасности для учета soft delete
DROP POLICY IF EXISTS "Users can view their own daily selections" ON daily_selection_entries;
CREATE POLICY "Users can view their own daily selections" ON daily_selection_entries
    FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Комментарий к новому полю
COMMENT ON COLUMN daily_selection_entries.deleted_at IS 'Время мягкого удаления записи (NULL = не удалена)';