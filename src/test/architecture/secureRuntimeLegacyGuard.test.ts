import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");
const sourceRoot = resolve(projectRoot, "src");

const productionFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "test"
        ? []
        : productionFiles(absolutePath);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
      ? [absolutePath]
      : [];
  });

const forbidden = [
  /Supabase/,
  /supabase/,
  /TodoDatabase/,
  /VITE_SUPABASE/,
  /SyncInitializer/,
  /(?:from|import\()[^\n]*(?:useAuth|useSync)/,
];

describe("secure production runtime", () => {
  it("contains no legacy server or database path", () => {
    const violations = productionFiles(sourceRoot)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return forbidden.some((pattern) => pattern.test(source))
          ? [relative(projectRoot, file)]
          : [];
      })
      .sort();

    expect(violations).toEqual([]);
  });
});
