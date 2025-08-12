import { injectable, inject } from "tsyringe";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  SupabaseClientFactory,
  Database,
  SupabaseUtils,
} from "../database/SupabaseClient";
import * as tokens from "../di/tokens";

/**
 * Service that coordinates master device reservation so that only one device
 * performs background actions for a user. A device acquires the master role if
 * no active master exists or if the previous reservation expired. The role is
 * reserved for 30 minutes and automatically extended when the master checks in.
 */
@injectable()
export class MasterDeviceService {
  private readonly RESERVATION_MS = 30 * 60 * 1000; // 30 minutes
  private client: SupabaseClient<Database>;
  private deviceId: string;
  private userId: string | null = null;

  constructor(
    @inject(tokens.SUPABASE_CLIENT_FACTORY_TOKEN)
    clientFactory: SupabaseClientFactory
  ) {
    this.client = clientFactory.getClient();
    this.deviceId = SupabaseUtils.getDeviceId();
    this.initializeUserId();
  }

  private async initializeUserId(): Promise<void> {
    this.userId = await SupabaseUtils.getUserId(this.client);
  }

  /**
     * Try to acquire or renew the master role for this device.
     * Returns true when this device becomes (or already is) the master.
     */
  async acquireMaster(): Promise<boolean> {
    if (!this.userId) {
      await this.initializeUserId();
    }
    if (!this.userId) return false;

    const now = new Date();
    const nowIso = now.toISOString();
    const newExpiry = new Date(now.getTime() + this.RESERVATION_MS).toISOString();

    // Check current master record
    const { data: existing, error: selectError } = await this.client
      .from("master_devices")
      .select("device_id, expires_at")
      .eq("user_id", this.userId)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      // PGRST116 means no rows; other errors we treat as failure
      console.error("Failed to check master device:", selectError);
      return false;
    }

    if (existing) {
      const expiresAt = new Date(existing.expires_at);
      if (existing.device_id === this.deviceId && expiresAt > now) {
        // We are already master; extend reservation
        await this.client
          .from("master_devices")
          .update({ expires_at: newExpiry })
          .eq("user_id", this.userId);
        return true;
      }
      if (expiresAt > now) {
        // Another active master
        return false;
      }
      // Reservation expired -> attempt to take over
      const { data: updated, error: updateError } = await this.client
        .from("master_devices")
        .update({ device_id: this.deviceId, expires_at: newExpiry })
        .eq("user_id", this.userId)
        .lte("expires_at", nowIso)
        .select();

      if (!updateError && updated && updated.length > 0) {
        return true;
      }
      // If update fails (e.g., because record changed), fallback to insert
    }

    // Try to insert new master record
    const { error: insertError } = await this.client
      .from("master_devices")
      .insert({
        user_id: this.userId,
        device_id: this.deviceId,
        expires_at: newExpiry,
      });

    if (insertError) {
      // Duplicate key means someone else became master simultaneously
      return false;
    }
    return true;
  }

  /**
   * Checks if this device currently holds the master role.
   */
  async isMaster(): Promise<boolean> {
    if (!this.userId) {
      await this.initializeUserId();
    }
    if (!this.userId) return false;

    const { data, error } = await this.client
      .from("master_devices")
      .select("device_id, expires_at")
      .eq("user_id", this.userId)
      .single();

    if (error || !data) return false;

    return (
      data.device_id === this.deviceId &&
      new Date(data.expires_at) > new Date()
    );
  }

  /**
   * Releases master role if this device holds it.
   */
  async release(): Promise<void> {
    if (!this.userId) {
      await this.initializeUserId();
    }
    if (!this.userId) return;

    await this.client
      .from("master_devices")
      .delete()
      .eq("user_id", this.userId)
      .eq("device_id", this.deviceId);
  }
}
