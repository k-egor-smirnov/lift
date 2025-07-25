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
