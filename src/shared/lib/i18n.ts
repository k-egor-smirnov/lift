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
        today: 'Сегодня'
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
