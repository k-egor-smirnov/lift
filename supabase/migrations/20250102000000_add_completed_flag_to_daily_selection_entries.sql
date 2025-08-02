-- Добавляем колонку completed_flag в таблицу daily_selection_entries
ALTER TABLE daily_selection_entries 
ADD COLUMN completed_flag BOOLEAN NOT NULL DEFAULT false;

-- Добавляем индекс для оптимизации запросов по completed_flag
CREATE INDEX idx_daily_selection_completed_flag ON daily_selection_entries(completed_flag);

-- Комментарий к новой колонке
COMMENT ON COLUMN daily_selection_entries.completed_flag IS 'Флаг завершения задачи в ежедневном выборе';