-- Миграция: создание таблицы master_devices для бронирования роли мастера

CREATE TABLE master_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Включаем RLS
ALTER TABLE master_devices ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут управлять только своей записью мастера
CREATE POLICY "Users can manage their master record" ON master_devices
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Индекс для быстрого поиска по времени истечения
CREATE INDEX idx_master_devices_expires_at ON master_devices(expires_at);
