import { injectable, inject } from "tsyringe";
import { SupabaseClient } from "@supabase/supabase-js";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import {
  DayResetRepository,
  DayResetMetadata,
} from "../../domain/repositories/DayResetRepository";
import { SUPABASE_CLIENT_FACTORY_TOKEN } from "../di/tokens";
import { SupabaseClientFactory } from "../database/SupabaseClient";

/**
 * Supabase implementation of DayResetRepository
 */
@injectable()
export class SupabaseDayResetRepository implements DayResetRepository {
  private supabase: SupabaseClient;

  constructor(
    @inject(SUPABASE_CLIENT_FACTORY_TOKEN)
    private supabaseClientFactory: SupabaseClientFactory
  ) {
    this.supabase = this.supabaseClientFactory.getClient();
  }

  async getDayResetMetadata(userId: string): Promise<DayResetMetadata | null> {
    const { data, error } = await this.supabase
      .from("day_reset_metadata")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return null;
      }
      throw new Error(`Failed to get day reset metadata: ${error.message}`);
    }

    return {
      userId: data.user_id,
      lastResetDate: data.last_reset_date
        ? DateOnly.fromString(data.last_reset_date)
        : DateOnly.today(),
      lastSnapshotId: data.last_snapshot_id,
      resetEventId: data.reset_event_id,
      lastStartConfirmedDate: data.last_start_confirmed_date
        ? DateOnly.fromString(data.last_start_confirmed_date)
        : null,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async upsertDayResetMetadata(
    metadata: Omit<DayResetMetadata, "createdAt" | "updatedAt">
  ): Promise<void> {
    const { error } = await this.supabase.from("day_reset_metadata").upsert(
      {
        user_id: metadata.userId,
        last_reset_date: metadata.lastResetDate?.value || null,
        last_snapshot_id: metadata.lastSnapshotId,
        reset_event_id: metadata.resetEventId,
        last_start_confirmed_date:
          metadata.lastStartConfirmedDate?.value || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      throw new Error(`Failed to upsert day reset metadata: ${error.message}`);
    }
  }

  private async updateDayResetMetadata(
    metadata: DayResetMetadata
  ): Promise<void> {
    const { error } = await this.supabase.from("day_reset_metadata").upsert(
      {
        user_id: metadata.userId,
        last_reset_date: metadata.lastResetDate?.value || null,
        last_snapshot_id: metadata.lastSnapshotId,
        reset_event_id: metadata.resetEventId,
        last_start_confirmed_date:
          metadata.lastStartConfirmedDate?.value || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      throw new Error(`Failed to update day reset metadata: ${error.message}`);
    }
  }

  async needsDayReset(userId: string, currentDate: DateOnly): Promise<boolean> {
    const metadata = await this.getDayResetMetadata(userId);

    // Reset if no metadata exists or last reset was not today
    if (!metadata || !metadata.lastResetDate) {
      return true;
    }

    return !metadata.lastResetDate.equals(currentDate);
  }

  async shouldShowStartOfDayModal(
    userId: string,
    date: DateOnly
  ): Promise<boolean> {
    const metadata = await this.getDayResetMetadata(userId);

    // Show modal if:
    // 1. Day was reset today but start of day was not confirmed
    // 2. Or if no metadata exists (first time)
    if (!metadata) {
      return true;
    }

    // If last reset was today but start of day was not confirmed for today
    if (metadata.lastResetDate && metadata.lastResetDate.equals(date)) {
      return (
        !metadata.lastStartConfirmedDate ||
        !metadata.lastStartConfirmedDate.equals(date)
      );
    }

    return false;
  }

  async markStartOfDayConfirmed(userId: string, date: DateOnly): Promise<void> {
    const metadata = await this.getDayResetMetadata(userId);

    if (!metadata) {
      throw new Error("Cannot confirm start of day without existing metadata");
    }

    const updatedMetadata: DayResetMetadata = {
      ...metadata,
      lastStartConfirmedDate: date,
      updatedAt: new Date(),
    };

    await this.updateDayResetMetadata(updatedMetadata);
  }

  async isRestoreAvailable(userId: string, date: DateOnly): Promise<boolean> {
    const metadata = await this.getDayResetMetadata(userId);

    // Restore is available if:
    // 1. Day was reset today
    // 2. There's a snapshot available
    // 3. Start of day was not confirmed yet
    if (!metadata || !metadata.lastResetDate || !metadata.lastSnapshotId) {
      return false;
    }

    const wasResetToday = metadata.lastResetDate.equals(date);
    const wasNotConfirmed =
      !metadata.lastStartConfirmedDate ||
      !metadata.lastStartConfirmedDate.equals(date);

    return wasResetToday && wasNotConfirmed;
  }
}
