-- Исправляем политики RLS для daily_selection_entries чтобы разрешить операции с deleted_at

-- Удаляем старые политики INSERT и UPDATE
DROP POLICY IF EXISTS "Users can insert their own daily selections" ON daily_selection_entries;
DROP POLICY IF EXISTS "Users can update their own daily selections" ON daily_selection_entries;

-- Создаем новые политики INSERT и UPDATE без ограничений на deleted_at
CREATE POLICY "Users can insert their own daily selections" ON daily_selection_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily selections" ON daily_selection_entries
    FOR UPDATE USING (auth.uid() = user_id);

-- Комментарий к изменениям
COMMENT ON TABLE daily_selection_entries IS 'Записи о ежедневном выборе задач с поддержкой мягкого удаления';