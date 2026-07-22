import type { OccurrenceIdFactory } from "../../application/ports/OccurrenceIdFactory";
import { isValidDateOnly } from "../../domain/EffectiveDate";

export class Sha256OccurrenceIdFactory implements OccurrenceIdFactory {
  async create(templateId: string, occurrenceDate: string): Promise<string> {
    if (typeof templateId !== "string" || templateId.trim().length === 0) {
      throw new Error("Invalid templateId");
    }
    if (!isValidDateOnly(occurrenceDate)) {
      throw new Error("Invalid occurrenceDate");
    }

    const bytes = new TextEncoder().encode(`${templateId}\0${occurrenceDate}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }
}
