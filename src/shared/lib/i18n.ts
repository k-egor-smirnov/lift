import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      categories: {
        SIMPLE: "Simple",
        FOCUS: "Focus",
        INBOX: "Inbox",
      },
      navigation: {
        today: 'Today',
        descriptions: {
          today: 'Focus on what matters most today',
          simple: 'Quick tasks that take less than 15 minutes',
          focus: 'Important tasks requiring deep concentration',
          inbox: 'New tasks waiting to be organized'
        }
      },
      dailyModal: {
        goodMorning: 'Good Morning!',
        closeModal: 'Close modal',
        unfinishedFromYesterday: 'Unfinished from yesterday',
        overdueInboxTasks: 'Overdue inbox tasks',
        inboxTasks: 'Inbox tasks',
        needsReview: 'Needs review',
        inInboxFor: 'In inbox for',
        days: 'days',
        returnToToday: 'Return to Today',
        allCaughtUp: 'All caught up!',
        readyToStart: 'Ready to start your productive day',
        letsGetStarted: "Let's get started!"
      },
    },
  },
  ru: {
    translation: {
      categories: {
        simple: "Простые",
        focus: "Фокус",
        inbox: "Входящие",
      },
      navigation: {
        today: 'Сегодня',
        descriptions: {
          today: 'Сосредоточьтесь на самом важном сегодня',
          simple: 'Быстрые задачи, которые займут менее 15 минут',
          focus: 'Важные задачи, требующие глубокой концентрации',
          inbox: 'Новые задачи, ожидающие организации'
        }
      },
      todayView: {
        progress: "Прогресс",
      },
      tasks: {
        newTask: 'Новая задача'
      },
      dailyModal: {
        goodMorning: 'Доброе утро!',
        closeModal: 'Закрыть модальное окно',
        unfinishedFromYesterday: 'Незавершенные со вчера',
        overdueInboxTasks: 'Просроченные задачи из входящих',
        inboxTasks: 'Задачи из входящих',
        needsReview: 'Требует рассмотрения',
        inInboxFor: 'Во входящих уже',
        days: 'дней',
        returnToToday: 'Вернуть в Сегодня',
        allCaughtUp: 'Все дела в порядке!',
        readyToStart: 'Готовы начать продуктивный день',
        letsGetStarted: 'Давайте начнем!'
      }
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
