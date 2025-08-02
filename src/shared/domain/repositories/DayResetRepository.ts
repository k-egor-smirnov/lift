import { DateOnly } from '../value-objects/DateOnly';

/**
 * Day reset metadata
 */
export interface DayResetMetadata {
  userId: string;
  resetEventId: string;
  lastSnapshotId: string;
  lastResetDate: DateOnly;
  lastStartConfirmedDate: DateOnly | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Repository interface for day reset operations
 */
export interface DayResetRepository {
  /**
   * Get day reset metadata for user
   */
  getDayResetMetadata(userId: string): Promise<DayResetMetadata | null>;

  /**
   * Create or update day reset metadata (idempotent)
   */
  upsertDayResetMetadata(metadata: Omit<DayResetMetadata, 'createdAt' | 'updatedAt'>): Promise<void>;

  /**
   * Check if day needs reset
   */
  needsDayReset(userId: string, currentDate: DateOnly): Promise<boolean>;

  /**
   * Check if start of day modal should be shown
   */
  shouldShowStartOfDayModal(userId: string, currentDate: DateOnly): Promise<boolean>;

  /**
   * Mark start of day as confirmed
   */
  markStartOfDayConfirmed(userId: string, date: DateOnly): Promise<void>;

  /**
   * Check if restore is available
   */
  isRestoreAvailable(userId: string, date: DateOnly): Promise<boolean>;
}