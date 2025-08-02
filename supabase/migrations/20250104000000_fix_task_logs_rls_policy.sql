-- Добавляем недостающую политику UPDATE для таблицы task_logs
-- Это исправляет ошибку RLS при синхронизации логов задач

CREATE POLICY "Users can update their own task logs" ON task_logs
    FOR UPDATE USING (auth.uid() = user_id);

-- Комментарий к исправлению
COMMENT ON POLICY "Users can update their own task logs" ON task_logs IS 'Разрешает пользователям обновлять свои собственные логи задач при синхронизации';