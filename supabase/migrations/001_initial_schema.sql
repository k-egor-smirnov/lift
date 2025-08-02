-- Создание таблиц для приложения Lift
-- Миграция 001: Начальная схема базы данных

-- Включаем расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Создаем enum типы
CREATE TYPE task_category AS ENUM ('SIMPLE', 'FOCUS', 'INBOX', 'DEFERRED');
CREATE TYPE task_status AS ENUM ('ACTIVE', 'COMPLETED');

-- Таблица задач
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(title) > 0),
    category task_category NOT NULL DEFAULT 'INBOX',
    status task_status NOT NULL DEFAULT 'ACTIVE',
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    inbox_entered_at TIMESTAMPTZ,
    deferred_until TIMESTAMPTZ,
    original_category task_category,
    device_id TEXT,
    sync_version INTEGER NOT NULL DEFAULT 1,
    
    -- Индексы
    CONSTRAINT tasks_title_not_empty CHECK (length(trim(title)) > 0)
);

-- Таблица записей ежедневного выбора
CREATE TABLE daily_selection_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id TEXT,
    sync_version INTEGER NOT NULL DEFAULT 1,
    
    -- Уникальность: одна задача может быть выбрана только один раз в день
    UNIQUE(user_id, task_id, date)
);

-- Таблица логов задач
CREATE TABLE task_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id TEXT,
    sync_version INTEGER NOT NULL DEFAULT 1
);

-- Таблица настроек пользователя
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id TEXT,
    sync_version INTEGER NOT NULL DEFAULT 1
);

-- Таблица метаданных синхронизации
CREATE TABLE sync_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_token TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Уникальность: одно устройство на пользователя
    UNIQUE(user_id, device_id)
);

-- Создаем индексы для оптимизации запросов

-- Индексы для таблицы tasks
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_user_category_status ON tasks(user_id, category, status);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_deferred_until ON tasks(deferred_until) WHERE deferred_until IS NOT NULL;
CREATE INDEX idx_tasks_sync_version ON tasks(sync_version);

-- Индексы для таблицы daily_selection_entries
CREATE INDEX idx_daily_selection_user_id ON daily_selection_entries(user_id);
CREATE INDEX idx_daily_selection_date ON daily_selection_entries(date);
CREATE INDEX idx_daily_selection_user_date ON daily_selection_entries(user_id, date);
CREATE INDEX idx_daily_selection_updated_at ON daily_selection_entries(updated_at);

-- Индексы для таблицы task_logs
CREATE INDEX idx_task_logs_user_id ON task_logs(user_id);
CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_task_logs_timestamp ON task_logs(timestamp);
CREATE INDEX idx_task_logs_action ON task_logs(action);

-- Индексы для таблицы sync_metadata
CREATE INDEX idx_sync_metadata_user_id ON sync_metadata(user_id);
CREATE INDEX idx_sync_metadata_device_id ON sync_metadata(device_id);
CREATE INDEX idx_sync_metadata_last_sync_at ON sync_metadata(last_sync_at);

-- Функции для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_selection_entries_updated_at BEFORE UPDATE ON daily_selection_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_metadata_updated_at BEFORE UPDATE ON sync_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция для автоматического увеличения sync_version
CREATE OR REPLACE FUNCTION increment_sync_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.sync_version = COALESCE(OLD.sync_version, 0) + 1;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического увеличения sync_version при обновлении
CREATE TRIGGER increment_tasks_sync_version BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION increment_sync_version();

CREATE TRIGGER increment_daily_selection_sync_version BEFORE UPDATE ON daily_selection_entries
    FOR EACH ROW EXECUTE FUNCTION increment_sync_version();

CREATE TRIGGER increment_task_logs_sync_version BEFORE UPDATE ON task_logs
    FOR EACH ROW EXECUTE FUNCTION increment_sync_version();

CREATE TRIGGER increment_user_settings_sync_version BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION increment_sync_version();

-- Настройка Row Level Security (RLS)

-- Включаем RLS для всех таблиц
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_selection_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

-- Политики безопасности для таблицы tasks
CREATE POLICY "Users can view their own tasks" ON tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks" ON tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks" ON tasks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks" ON tasks
    FOR DELETE USING (auth.uid() = user_id);

-- Политики безопасности для таблицы daily_selection_entries
CREATE POLICY "Users can view their own daily selections" ON daily_selection_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily selections" ON daily_selection_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily selections" ON daily_selection_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily selections" ON daily_selection_entries
    FOR DELETE USING (auth.uid() = user_id);

-- Политики безопасности для таблицы task_logs
CREATE POLICY "Users can view their own task logs" ON task_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own task logs" ON task_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Политики безопасности для таблицы user_settings
CREATE POLICY "Users can view their own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Политики безопасности для таблицы sync_metadata
CREATE POLICY "Users can view their own sync metadata" ON sync_metadata
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync metadata" ON sync_metadata
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync metadata" ON sync_metadata
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sync metadata" ON sync_metadata
    FOR DELETE USING (auth.uid() = user_id);

-- Функция для очистки старых логов (опционально)
CREATE OR REPLACE FUNCTION cleanup_old_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM task_logs 
    WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарии к таблицам
COMMENT ON TABLE tasks IS 'Основная таблица задач приложения Lift';
COMMENT ON TABLE daily_selection_entries IS 'Записи о ежедневном выборе задач';
COMMENT ON TABLE task_logs IS 'Логи действий с задачами для аудита';
COMMENT ON TABLE user_settings IS 'Настройки пользователей';
COMMENT ON TABLE sync_metadata IS 'Метаданные для синхронизации между устройствами';

-- Комментарии к важным колонкам
COMMENT ON COLUMN tasks.sync_version IS 'Версия для отслеживания изменений при синхронизации';
COMMENT ON COLUMN tasks.device_id IS 'Идентификатор устройства, с которого была создана/изменена задача';
COMMENT ON COLUMN tasks.deferred_until IS 'Дата и время, до которой задача отложена';
COMMENT ON COLUMN tasks.original_category IS 'Оригинальная категория задачи до перемещения в другую категорию';