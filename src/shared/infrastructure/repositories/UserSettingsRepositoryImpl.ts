import { UserSettingsRepository } from "../../domain/repositories/UserSettingsRepository";
import { TodoDatabase, UserSettingsRecord } from "../database/TodoDatabase";

/**
 * Repository implementation for UserSettings using IndexedDB
 */
export class UserSettingsRepositoryImpl implements UserSettingsRepository {
  constructor(private db: TodoDatabase) {}

  async get<T = any>(key: string): Promise<T | null> {
    const record = await this.db.userSettings.get(key);
    return record ? record.value : null;
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    await this.db.userSettings.put({
      key,
      value,
      updatedAt: new Date(),
    });
  }

  async getMany(keys: string[]): Promise<Record<string, any>> {
    const records = await this.db.userSettings
      .where("key")
      .anyOf(keys)
      .toArray();

    const result: Record<string, any> = {};
    records.forEach((record) => {
      result[record.key] = record.value;
    });

    return result;
  }

  async setMany(settings: Record<string, any>): Promise<void> {
    const records: UserSettingsRecord[] = Object.entries(settings).map(
      ([key, value]) => ({
        key,
        value,
        updatedAt: new Date(),
      })
    );

    await this.db.userSettings.bulkPut(records);
  }

  async has(key: string): Promise<boolean> {
    const record = await this.db.userSettings.get(key);
    return record !== undefined;
  }

  async remove(key: string): Promise<void> {
    await this.db.userSettings.delete(key);
  }

  async getAll(): Promise<Record<string, any>> {
    const records = await this.db.userSettings.toArray();
    const result: Record<string, any> = {};

    records.forEach((record) => {
      result[record.key] = record.value;
    });

    return result;
  }

  async clear(): Promise<void> {
    await this.db.userSettings.clear();
  }
}
