export const auditStringRecord = (
  values: Readonly<Record<string, unknown>> | undefined
): Record<string, string> => {
  if (values === undefined) return {};
  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value : (JSON.stringify(value) ?? "null"),
      ])
  );
};
