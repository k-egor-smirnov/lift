import packageJson from "../../../package.json";

describe("secure sync dependency policy", () => {
  it("pins audited protocol dependencies instead of floating ranges", () => {
    expect(packageJson.dependencies).toMatchObject({
      "@automerge/automerge": "3.3.2",
      "matrix-js-sdk": "42.0.0",
      dexie: "4.4.4",
      "fractional-indexing": "4.0.0",
      fflate: "0.8.3",
      zod: "4.4.3",
    });
    expect(packageJson.devDependencies).toMatchObject({
      "fast-check": "4.9.0",
    });
    expect(packageJson.scripts).toHaveProperty("typecheck", "tsc --noEmit");
    expect(packageJson.scripts).toHaveProperty("verify");
  });
});
