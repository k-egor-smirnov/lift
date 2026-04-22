export class Tag {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly color: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}
}

export const DEFAULT_TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];
