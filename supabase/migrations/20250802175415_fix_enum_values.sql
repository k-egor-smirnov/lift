-- Исправление значений enum'ов на правильные uppercase значения
-- Миграция 003: Исправление enum значений

-- Создаем новые enum типы с правильными значениями
CREATE TYPE task_category_new AS ENUM ('SIMPLE', 'FOCUS', 'INBOX', 'DEFERRED');
CREATE TYPE task_status_new AS ENUM ('ACTIVE', 'COMPLETED');

-- Удаляем DEFAULT значения перед изменением типов
ALTER TABLE tasks ALTER COLUMN category DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;

-- Изменяем колонки таблицы tasks для использования новых типов с маппингом старых значений
ALTER TABLE tasks 
  ALTER COLUMN category TYPE task_category_new USING (
    CASE category::text
      WHEN 'inbox' THEN 'INBOX'
      WHEN 'today' THEN 'SIMPLE'
      WHEN 'scheduled' THEN 'DEFERRED'
      WHEN 'someday' THEN 'FOCUS'
      WHEN 'logbook' THEN 'INBOX'
      ELSE 'INBOX'
    END
  )::task_category_new;

ALTER TABLE tasks 
  ALTER COLUMN original_category TYPE task_category_new USING (
    CASE original_category::text
      WHEN 'inbox' THEN 'INBOX'
      WHEN 'today' THEN 'SIMPLE'
      WHEN 'scheduled' THEN 'DEFERRED'
      WHEN 'someday' THEN 'FOCUS'
      WHEN 'logbook' THEN 'INBOX'
      ELSE NULL
    END
  )::task_category_new;

ALTER TABLE tasks 
  ALTER COLUMN status TYPE task_status_new USING (
    CASE status::text
      WHEN 'active' THEN 'ACTIVE'
      WHEN 'completed' THEN 'COMPLETED'
      ELSE 'ACTIVE'
    END
  )::task_status_new;

-- Обновляем DEFAULT значения
ALTER TABLE tasks ALTER COLUMN category SET DEFAULT 'INBOX'::task_category_new;
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'ACTIVE'::task_status_new;

-- Удаляем старые типы
DROP TYPE task_category;
DROP TYPE task_status;

-- Переименовываем новые типы
ALTER TYPE task_category_new RENAME TO task_category;
ALTER TYPE task_status_new RENAME TO task_status;