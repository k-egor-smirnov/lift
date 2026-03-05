<div align="center">

# 🚀 Lift

### Daily Todo PWA — Фокус на продуктивность

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![codecov](https://codecov.io/gh/k-egor-smirnov/lift/branch/master/graph/badge.svg?token=HCux4yqDmZ)](https://codecov.io/gh/k-egor-smirnov/lift)

**Прогрессивное веб-приложение для управления ежедневными задачами с фокусом на продуктивность**

[🚀 Демо](https://lift.egor.dev) • [📚 Документация](#документация) • [🐛 Баги](https://github.com/k-egor-smirnov/lift/issues) • [✨ Фичи](#основные-возможности)

</div>

---

## 📸 Скриншоты

> **Note:** Добавьте скриншоты в папку `docs/screenshots/` и обновите пути

<table>
  <tr>
    <td align="center"><b>Сегодня</b></td>
    <td align="center"><b>Категории</b></td>
    <td align="center"><b>Статистика</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/today-view.png" alt="Today View" width="300"/></td>
    <td><img src="docs/screenshots/categories.png" alt="Categories" width="300"/></td>
    <td><img src="docs/screenshots/statistics.png" alt="Statistics" width="300"/></td>
  </tr>
</table>

---

## ✨ Основные возможности

### 📋 Управление задачами
- ✅ Создание, редактирование, выполнение и удаление задач
- 🏷️ Категоризация: **Inbox** (новые), **Simple** (быстрые), **Focus** (важные)
- 📅 Отложенные задачи с автоматическим возвратом
- 🔄 Drag-and-drop для приоритизации

### 🎯 Ежедневный фокус
- ☀️ Представление **"Сегодня"** для фокуса на важных задачах
- 🌅 **Daily Modal** для планирования дня
- 📊 Прогресс-бар выполнения
- 💡 Мотивационные сообщения

### 📊 Аналитика
- 📈 Статистика выполнения задач
- 📉 Графики продуктивности
- 📝 Логирование всех действий
- 🔍 Фильтрация по категориям

### 🔌 Интеграции
- ☁️ **Supabase** для синхронизации между устройствами
- 🔄 Real-time обновления
- 🔐 Аутентификация через email/password
- 📱 **PWA** — работает офлайн

### 🌐 Интернационализация
- 🇷🇺 Полная поддержка русского языка
- 🇺🇸 English support
- 🔄 Переключение языка на лету

---

## 🛠 Технологический стек

<table>
<tr>
<td>

### Frontend
- ⚛️ **React 18** + TypeScript
- ⚡ **Vite** для сборки
- 🎨 **Tailwind CSS**
- 🧩 **Radix UI** компоненты
- 📦 **Zustand** состояние
- 💉 **TSyringe** DI

</td>
<td>

### Backend & Data
- 🗄️ **IndexedDB** (Dexie)
- ☁️ **Supabase** (PostgreSQL)
- 🔄 Real-time subscriptions
- 🔐 Row Level Security

</td>
<td>

### Quality
- ✅ **Vitest** unit-тесты
- 🎭 **Testing Library**
- 🤖 **Playwright** E2E
- 📊 **Codecov** покрытие

</td>
</tr>
</table>

---

## 🚀 Быстрый старт

### Предварительные требования

- Node.js 18+
- npm или yarn
- Supabase аккаунт (опционально)

### Установка

```bash
# Клонирование репозитория
git clone https://github.com/k-egor-smirnov/lift.git
cd lift

# Установка зависимостей
npm install

# Настройка окружения
cp .env.example .env.local
```

### Конфигурация Supabase

1. Создайте проект на [Supabase](https://supabase.com)
2. Скопируйте URL и anon key из настроек проекта
3. Добавьте в `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Выполните SQL миграции из `supabase/migrations/`

📚 **Подробная документация по Supabase:**
- [Официальная документация](https://supabase.com/docs)
- [Настройка аутентификации](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

### Запуск

```bash
# Режим разработки
npm run dev

# Сборка для продакшена
npm run build

# Предпросмотр продакшен сборки
npm run preview

# Запуск тестов
npm run test

# E2E тестирование
npx playwright test
```

---

## 🏗 Архитектура

Проект следует **Clean Architecture** с **Domain-Driven Design**:

```
src/
├── features/           # Feature-based структура
│   ├── today/         # Ежедневные задачи
│   ├── tasks/         # Управление задачами
│   ├── stats/         # Статистика
│   └── onboarding/    # Онбординг
├── shared/            # Общие модули
│   ├── domain/       # Доменный слой
│   ├── application/  # Use cases
│   ├── infrastructure/ # Репозитории
│   └── ui/           # UI компоненты
└── main.tsx          # Точка входа
```

### Слои:

- **Domain**: Сущности, Value Objects, Domain Events
- **Application**: Use Cases, Services
- **Infrastructure**: Репозитории, внешние адаптеры
- **Presentation**: React компоненты, View Models

---

## 📚 Документация

- [Требования](./.kiro/specs/daily-todo-pwa/requirements.md)
- [Дизайн](./.kiro/specs/daily-todo-pwa/design.md)
- [Технический стек](./.kiro/steering/tech.md)

---

## 🧪 Тестирование

```bash
# Unit тесты
npm run test

# E2E тесты
npx playwright test

# Покрытие кода
npm run test:coverage
```

---

## 📦 Деплой

### Vercel (рекомендуется)

```bash
# Установка Vercel CLI
npm i -g vercel

# Деплой
vercel --prod
```

### Docker

```bash
# Сборка образа
docker build -t lift-app .

# Запуск контейнера
docker run -p 4173:4173 lift-app
```

---

## 🤝 Участие в разработке

Мы приветствуем любой вклад! Пожалуйста, ознакомьтесь с [руководством по участию](CONTRIBUTING.md).

1. Форкните репозиторий
2. Создайте ветку (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

---

## 📝 Лицензия

Этот проект лицензирован под MIT License - см. [LICENSE](LICENSE) файл.

---

## 🙏 Благодарности

- [React Team](https://reactjs.org/) за удивительный фреймворк
- [Supabase](https://supabase.com/) за отличный BaaS
- [Radix UI](https://www.radix-ui.com/) за доступные компоненты
- [Tailwind CSS](https://tailwindcss.com/) за удобную стилизацию

---

<div align="center">

**Сделано с ❤️ для продуктивности**

[⬆ Вернуться к началу](#-lift)

</div>
