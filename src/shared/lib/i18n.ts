import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      categories: {
        simple: "Simple",
        focus: "Focus",
        inbox: "Inbox",
        deferred: "Deferred",
      },
      navigation: {
        today: "Today",
        descriptions: {
          today: "Focus on what matters most today",
          simple: "Quick tasks that take less than 15 minutes",
          focus: "Important tasks requiring deep concentration",
          inbox: "New tasks waiting to be organized",
          deferred: "Tasks postponed until a specific date",
        },
      },
      dailyModal: {
        goodMorning: "Good Morning!",
        closeModal: "Close modal",
        unfinishedFromYesterday: "Unfinished from yesterday",
        overdueInboxTasks: "Overdue inbox tasks",
        inboxTasks: "Inbox tasks",
        needsReview: "Needs review",
        inInboxFor: "In inbox for",
        days: "days",
        returnToToday: "Return to Today",
        allCaughtUp: "All caught up!",
        readyToStart: "Ready to start your productive day",
        letsGetStarted: "Let's get started!",
      },
      taskCard: {
        deferTask: "Defer Task",
        deferTaskWithTitle: "Defer task: {{title}}",
      },
    },
  },
  ru: {
    translation: {
      categories: {
        simple: "Простые",
        focus: "Фокус",
        inbox: "Входящие",
        deferred: "Отложенные",
      },
      navigation: {
        today: "Сегодня",
        descriptions: {
          today: "Сосредоточьтесь на важном",
          simple: "Быстрые задачи, которые займут менее 15 минут",
          focus: "Важные задачи, требующие глубокой концентрации",
          inbox: "Новые задачи, ожидающие распределения",
        },
      },
      todayView: {
        progress: "Прогресс",
        complete: "Выполнено",
        activeTasks: "Задачи на сегодня",
        tip: "Подсказка",
        dailySelectionResets:
          "Каждый день список сегодняшних задач сбрасывается",
        noTasksSelected: "Задачи не выбраны",
        startByAdding: "Начните сегодняшний день, выбрав задачи из категорий",
      },
      taskCard: {
        deferTask: "Отложить задачу",
        deferTaskWithTitle: "Отложить задачу: {{title}}",
        noLogsYet: "Добавьте запись...",
        noLogsFound: "Записей ещё нет",
        lastLog: "",
        addNewLogPlaceholder: "Введите текст записи",
        logHistory: "Записи",
      },
      tasks: {
        newTask: "Новая задача",
      },
      dailyModal: {
        goodMorning: "Доброе утро!",
        closeModal: "Закрыть модальное окно",
        unfinishedFromYesterday: "Незавершенные со вчера",
        overdueInboxTasks: "Просроченные задачи из входящих",
        inboxTasks: "Задачи из входящих",
        needsReview: "Требует рассмотрения",
        inInboxFor: "Во входящих уже",
        days: "дней",
        returnToToday: "Вернуть в Сегодня",
        allCaughtUp: "Все дела в порядке!",
        readyToStart: "Готовы начать продуктивный день",
        letsGetStarted: "Давайте начнем!",
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "ru", // default language
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
