import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");
const sourceRoot = resolve(projectRoot, "src");

const allowedLegacyImports = new Set<string>();

const productionApplicationFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "__tests__"
        ? []
        : productionApplicationFiles(absolutePath);
    }

    return /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
      ? [absolutePath]
      : [];
  });

const applicationRoots = (): string[] => {
  const roots = [resolve(sourceRoot, "shared/application")];
  const featuresRoot = resolve(sourceRoot, "features");

  for (const feature of readdirSync(featuresRoot, { withFileTypes: true })) {
    if (!feature.isDirectory()) continue;
    const applicationDirectory = resolve(
      featuresRoot,
      feature.name,
      "application"
    );
    try {
      if (readdirSync(applicationDirectory).length >= 0) {
        roots.push(applicationDirectory);
      }
    } catch {
      // A feature without an Application layer is outside this boundary scan.
    }
  }

  return roots;
};

const forbiddenImport = (specifier: string): boolean =>
  specifier.includes("/infrastructure/") ||
  specifier.includes("dexie") ||
  specifier.includes("matrix-js-sdk") ||
  specifier.includes("@automerge");

const findViolations = (): string[] => {
  const importSpecifier =
    /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;

  return applicationRoots()
    .flatMap(productionApplicationFiles)
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const relativePath = relative(projectRoot, file);
      return Array.from(source.matchAll(importSpecifier), (match) => match[1])
        .filter(forbiddenImport)
        .map((specifier) => `${relativePath}::${specifier}`);
    })
    .sort();
};

describe("Application layer boundaries", () => {
  it("contains no infrastructure imports outside the exact temporary legacy allowlist", () => {
    const violations = findViolations();
    const unexpected = violations.filter(
      (violation) => !allowedLegacyImports.has(violation)
    );
    const actualAllowed = violations.filter((violation) =>
      allowedLegacyImports.has(violation)
    );
    const expectedAllowed = [...allowedLegacyImports].sort();
    const stale = [...allowedLegacyImports]
      .filter((allowed) => !violations.includes(allowed))
      .sort();

    expect({ unexpected, stale, actualAllowed }).toEqual({
      unexpected: [],
      stale: [],
      actualAllowed: expectedAllowed,
    });
  });
});
