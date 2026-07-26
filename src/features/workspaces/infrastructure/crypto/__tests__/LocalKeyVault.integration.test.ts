import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { LocalKeyVault } from "../LocalKeyVault";

const databaseName = () =>
  `LiftSecureDatabase-key-vault-${crypto.randomUUID()}`;

describe("LocalKeyVault", () => {
  it("persists non-extractable wrapping keys and encrypted Matrix secrets", async () => {
    const name = databaseName();
    const first = new LiftSecureDatabase(name);
    await first.open();
    const vault = new LocalKeyVault(first, () => 100);
    const cryptoKey = await vault.getOrCreateCryptoStoreKey(
      "p1",
      "@alice:test",
      "A"
    );
    await vault.storeAccessToken(
      "p1",
      "@alice:test",
      "A",
      "secret-access-token"
    );
    const records = await first.localSecrets.toArray();

    expect(cryptoKey).toHaveLength(32);
    expect(
      records.some((record) => "key" in record && record.key.extractable)
    ).toBe(false);
    expect(JSON.stringify(records)).not.toContain("secret-access-token");
    first.close();

    const reopened = new LiftSecureDatabase(name);
    await reopened.open();
    const restored = new LocalKeyVault(reopened);
    expect(
      await restored.getOrCreateCryptoStoreKey("p1", "@alice:test", "A")
    ).toEqual(cryptoKey);
    expect(await restored.loadAccessToken("p1", "@alice:test", "A")).toBe(
      "secret-access-token"
    );
    expect(
      await restored.getOrCreateCryptoStoreKey("p2", "@alice:test", "A")
    ).not.toEqual(cryptoKey);
    expect(
      await restored.getOrCreateCryptoStoreKey("p1", "@alice:test", "B")
    ).not.toEqual(cryptoKey);
    await reopened.delete();
  });
});
