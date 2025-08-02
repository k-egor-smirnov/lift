-- Полностью пересоздаем политики RLS для daily_selection_entries

-- Удаляем все существующие политики
DROP POLICY IF EXISTS "Users can view their own daily selections" ON daily_selection_entries;
DROP POLICY IF EXISTS "Users can insert their own daily selections" ON daily_selection_entries;
DROP POLICY IF EXISTS "Users can update their own daily selections" ON daily_selection_entries;
DROP POLICY IF EXISTS "Users can delete their own daily selections" ON daily_selection_entries;

-- Создаем новые политики с правильными условиями

-- SELECT: показываем только не удаленные записи пользователя
CREATE POLICY "Users can view their own daily selections" ON daily_selection_entries
    FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- INSERT: разрешаем вставку любых записей пользователя (включая с deleted_at)
CREATE POLICY "Users can insert their own daily selections" ON daily_selection_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: разрешаем обновление любых записей пользователя (включая установку deleted_at)
CREATE POLICY "Users can update their own daily selections" ON daily_selection_entries
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DELETE: разрешаем физическое удаление записей пользователя (если потребуется)
CREATE POLICY "Users can delete their own daily selections" ON daily_selection_entries
    FOR DELETE USING (auth.uid() = user_id);

-- Комментарий к изменениям
COMMENT ON TABLE daily_selection_entries IS 'Записи о ежедневном выборе задач с поддержкой мягкого удаления и исправленными политиками RLS';