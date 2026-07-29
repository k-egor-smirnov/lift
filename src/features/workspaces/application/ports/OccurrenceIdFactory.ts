export interface OccurrenceIdFactory {
  create(templateId: string, occurrenceDate: string): Promise<string>;
}
