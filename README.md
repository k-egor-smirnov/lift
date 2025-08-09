# Daily Todo PWA

[![codecov](https://codecov.io/gh/k-egor-smirnov/lift/branch/master/graph/badge.svg?token=HCux4yqDmZ)](https://codecov.io/gh/k-egor-smirnov/lift)

Прогрессивное веб-приложение для управления ежедневными задачами с фокусом на продуктивность и организацию.

## Основные возможности

- **Управление задачами**: создание, редактирование, выполнение и удаление задач с категоризацией
- **Ежедневный фокус**: представление "Сегодня" для выбора и фокуса на ежедневных задачах
- **Категории задач**: Inbox (новые), Simple (быстрые), Focus (важные/сложные)
- **Логирование задач**: отслеживание активности и истории задач
- **Статистика**: аналитика выполнения задач и продуктивности
- **Офлайн-режим**: работа без интернета через IndexedDB

## Технологический стек

### Frontend

- **React 18** с TypeScript
- **Vite** для сборки и разработки
- **PWA** возможности
- **Tailwind CSS** для стилизации
- **Radix UI** для доступных компонентов

### Архитектура

- **Clean Architecture** с Domain-Driven Design
- **Zustand** для управления состоянием
- **TSyringe** для dependency injection
- **Dexie** для работы с IndexedDB
- Local-first подход с интеграцией Supabase

### Тестирование

- **Vitest** для unit-тестов
- **Testing Library** для тестирования компонентов
- **Playwright** для E2E тестирования

## Архитектурные слои

- **Domain**: сущности, value objects, события
- **Application**: use cases и сервисы
- **Infrastructure**: репозитории и внешние адаптеры
- **Presentation**: React компоненты и view models

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка для продакшена
npm run build

# Запуск тестов
npm run test

# E2E тестирование
npx playwright test
```
