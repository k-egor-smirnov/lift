-- Миграция 002: Включение Realtime для таблиц
-- Эта миграция включает Realtime подписки для основных таблиц

-- Включаем Realtime для таблицы tasks
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- Включаем Realtime для таблицы daily_selection_entries
ALTER PUBLICATION supabase_realtime ADD TABLE daily_selection_entries;

-- Включаем Realtime для таблицы task_logs
ALTER PUBLICATION supabase_realtime ADD TABLE task_logs;

-- Включаем Realtime для таблицы user_settings
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;

-- Включаем Realtime для таблицы sync_metadata
ALTER PUBLICATION supabase_realtime ADD TABLE sync_metadata;

-- Комментарий
COMMENT ON PUBLICATION supabase_realtime IS 'Realtime publication для синхронизации данных в реальном времени';