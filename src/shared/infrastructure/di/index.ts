import "reflect-metadata";
import { container, configureContainer, initializeServices } from "./container";
import { configureSyncContainer } from "./syncContainer";
import * as tokens from "./tokens";

/**
 * Инициализирует все DI контейнеры в правильном порядке
 */
export async function initializeContainers(): Promise<void> {
  try {
    // Сначала настраиваем sync контейнер (содержит зависимости для основного контейнера)
    configureSyncContainer();

    // Затем настраиваем основной контейнер
    configureContainer();

    // Инициализируем сервисы, которым нужна стартовая конфигурация
    await initializeServices();

    console.log("DI containers initialized successfully");
  } catch (error) {
    console.error("Failed to initialize DI containers:", error);
    // Если sync контейнер не удалось настроить, пытаемся настроить хотя бы основной
    try {
      configureContainer();
      await initializeServices();
      console.log("Main container initialized without sync dependencies");
    } catch (mainError) {
      console.error("Failed to initialize main container:", mainError);
      throw mainError;
    }
  }
}

// Configure the containers on module load
initializeContainers().catch((error) => {
  console.error("Failed to initialize containers:", error);
});

// Export everything needed by the application
export { container, tokens };

// Helper function to get services
export function getService<T>(token: symbol): T {
  return container.resolve<T>(token);
}
