-- Миграция для изменения типа колонки order с INTEGER на BIGINT
-- Миграция 20250802181000: Исправление типа колонки order

-- Изменяем тип колонки order с INTEGER на BIGINT
ALTER TABLE tasks ALTER COLUMN "order" TYPE BIGINT;