import type { IndexedDBStore } from "matrix-js-sdk/lib/store/indexeddb.js";

type StoreConstructor = new (options: {
  indexedDB: IDBFactory;
  localStorage?: Storage;
  dbName: string;
}) => IndexedDBStore;

type StoreLoader = () => Promise<StoreConstructor>;

const loadIndexedDbStore: StoreLoader = async () =>
  (await import("matrix-js-sdk/lib/store/indexeddb.js")).IndexedDBStore;

export const matrixCryptoDatabasePrefix = (
  profileId: string,
  userId: string,
  deviceId: string
): string =>
  `lift-matrix-crypto:${profileId}:${encodeURIComponent(userId)}:${deviceId}`;

export const matrixEventDatabaseName = (
  profileId: string,
  userId: string,
  deviceId: string
): string =>
  `lift-matrix-events:${profileId}:${encodeURIComponent(userId)}:${deviceId}`;

export class MatrixEventStoreFactory {
  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    private readonly storage: Storage | undefined = typeof localStorage ===
    "undefined"
      ? undefined
      : localStorage,
    private readonly loadStore: StoreLoader = loadIndexedDbStore
  ) {}

  async create(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<IndexedDBStore> {
    const IndexedDbStore = await this.loadStore();
    return new IndexedDbStore({
      indexedDB: this.indexedDb,
      localStorage: this.storage,
      dbName: matrixEventDatabaseName(profileId, userId, deviceId),
    });
  }
}
