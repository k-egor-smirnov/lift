-- Миграция для исправления проблемы с NULL значениями в id колонке sync_metadata
-- Миграция 20250802182000: Исправление sync_metadata id

-- Удаляем существующие записи с NULL id (если есть)
DELETE FROM sync_metadata WHERE id IS NULL;

-- Добавляем DEFAULT значение для id колонки в sync_metadata
-- Используем функцию для генерации ULID-подобного ID
CREATE OR REPLACE FUNCTION generate_ulid_like_id()
RETURNS TEXT AS $$
DECLARE
    timestamp_part TEXT;
    random_part TEXT;
    chars TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    result TEXT := '';
    i INTEGER;
BEGIN
    -- Генерируем timestamp часть (10 символов)
    timestamp_part := LPAD(UPPER(TO_HEX(EXTRACT(EPOCH FROM NOW())::BIGINT)), 10, '0');
    
    -- Генерируем случайную часть (16 символов)
    FOR i IN 1..16 LOOP
        result := result || SUBSTR(chars, (RANDOM() * 32)::INTEGER + 1, 1);
    END LOOP;
    
    RETURN timestamp_part || result;
END;
$$ LANGUAGE plpgsql;

-- Устанавливаем DEFAULT для id колонки
ALTER TABLE sync_metadata ALTER COLUMN id SET DEFAULT generate_ulid_like_id();