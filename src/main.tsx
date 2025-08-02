import 'reflect-metadata';
import './shared/lib/i18n';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './App.css'
import { syncInitializer } from './shared/infrastructure/sync/SyncInitializer';

// Инициализируем синхронизацию при запуске приложения
syncInitializer.initialize().catch(error => {
  console.error('Failed to initialize sync on startup:', error);
  // Приложение продолжает работать даже если синхронизация не удалась
});

// Обработка закрытия приложения
window.addEventListener('beforeunload', () => {
  syncInitializer.shutdown();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)