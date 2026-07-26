import { ServerProfile } from "../ServerProfile";

describe("ServerProfile", () => {
  it.each([
    ["http://localhost:8008", "http://localhost:8008"],
    ["http://127.0.0.1:8008/", "http://127.0.0.1:8008"],
    ["http://127.42.0.1", "http://127.42.0.1"],
    ["http://[::1]:8008", "http://[::1]:8008"],
    ["https://matrix.example.test", "https://matrix.example.test"],
  ])("accepts %s", (input, normalized) => {
    expect(
      ServerProfile.create({ id: "p1", name: "Local", baseUrl: input })
    ).toEqual(expect.objectContaining({ baseUrl: normalized }));
  });

  it.each([
    "http://user:password@localhost:8008",
    "https://matrix.example.test/#fragment",
    "https://matrix.example.test/?query=yes",
    "https://matrix.example.test/client",
    "http://matrix.example.test",
    "file:///tmp/server",
    "http://2130706433:8008",
    "http://0177.0.0.1:8008",
    "http://127.1:8008",
    "http://127.000.0.1:8008",
  ])("rejects unsafe endpoint %s", (baseUrl) => {
    expect(() =>
      ServerProfile.create({ id: "p1", name: "Unsafe", baseUrl })
    ).toThrow();
  });
});
