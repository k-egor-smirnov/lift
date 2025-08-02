import { injectable, inject } from "tsyringe";
import { SyncService } from "./SyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Сервис для управления дебаунсингом синхронизации
 * Обеспечивает частую синхронизацию при мутациях, но не чаще чем раз в 10 секунд
 */
@injectable()
export class DebouncedSyncService {
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 10000; // 10 секунд
  private lastSyncTime = 0;

  constructor(
    @inject(tokens.SYNC_SERVICE_TOKEN)
    private syncService: SyncService
  ) {}

  /**
   * Запускает дебаунсированную синхронизацию
   * Вызывается при мутациях задач (создание, обновление, логи, добавление в "сегодня")
   */
  triggerSync(): void {
    const now = Date.now();
    
    // Если прошло меньше 10 секунд с последней синхронизации, откладываем
    if (now - this.lastSyncTime < this.DEBOUNCE_DELAY) {
      this.scheduleDelayedSync();
      return;
    }

    // Выполняем синхронизацию немедленно
    this.performImmediateSync();
  }

  /**
   * Планирует отложенную синхронизацию
   */
  private scheduleDelayedSync(): void {
    // Отменяем предыдущий таймер, если он есть
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Устанавливаем новый таймер
    this.debounceTimer = setTimeout(() => {
      this.performImmediateSync();
    }, this.DEBOUNCE_DELAY - (Date.now() - this.lastSyncTime));
  }

  /**
   * Выполняет синхронизацию немедленно
   */
  private performImmediateSync(): void {
    this.lastSyncTime = Date.now();
    
    // Отменяем таймер, если он есть
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Выполняем фоновую синхронизацию
    this.syncService.performBackgroundSync().catch(error => {
      console.warn('Debounced sync failed:', error);
    });
  }

  /**
   * Очищает все таймеры (для cleanup)
   */
  cleanup(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}