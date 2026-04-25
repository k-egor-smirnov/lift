import "reflect-metadata";
import { container, configureContainer } from "./container";
import { configureSyncContainer } from "./syncContainer";
import { DebouncedSyncService } from "../../application/services/DebouncedSyncService";
import * as tokens from "./tokens";

const registerNoopDebouncedSyncService = (): void => {
  container.registerInstance(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN, {
    triggerSync: () => {},
    cleanup: () => {},
  } as DebouncedSyncService);
};

/**
 * Инициализирует все DI контейнеры в правильном порядке
 */
export function initializeContainers(): void {
  try {
    // Сначала настраиваем sync контейнер (содержит зависимости для основного контейнера)
    configureSyncContainer();

    // Затем настраиваем основной контейнер
    configureContainer();

    console.log("DI containers initialized successfully");
  } catch (error) {
    console.warn(
      "Sync dependencies unavailable, continuing local-first:",
      error
    );
    // Если sync контейнер не удалось настроить, пытаемся настроить хотя бы основной
    try {
      registerNoopDebouncedSyncService();
      configureContainer();
      console.log("Main container initialized without sync dependencies");
    } catch (mainError) {
      console.error("Failed to initialize main container:", mainError);
      throw mainError;
    }
  }
}

// Configure the containers on module load
initializeContainers();

// Export everything needed by the application
export { container, tokens };

// Helper function to get services
export function getService<T>(token: symbol): T {
  return container.resolve<T>(token);
}
