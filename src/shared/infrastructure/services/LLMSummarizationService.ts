import { injectable, inject } from "tsyringe";
import { type Result, ResultFactory } from "../../domain/Result";
import {
  LLMSummarizationRequest,
  LLMSummarizationResponse,
  LLMSummarizationService,
} from "../../application/use-cases/ProcessSummaryUseCase";
import { LLMService } from "./LLMService";
import { LLMSettings } from "../../domain/types/LLMSettings";
import { SummaryType } from "../../domain/entities/Summary";
import { SummaryData } from "../../application/use-cases/GetSummaryDataUseCase";
import * as tokens from "../di/tokens";

/**
 * Implementation of LLMSummarizationService using the existing LLMService
 */
@injectable()
export class LLMSummarizationServiceImpl implements LLMSummarizationService {
  constructor(
    @inject(tokens.LLM_SERVICE_TOKEN)
    private readonly llmService: LLMService
  ) {}

  async generateSummary(
    request: LLMSummarizationRequest
  ): Promise<Result<LLMSummarizationResponse, Error>> {
    try {
      // Get LLM settings (for now, use default settings)
      const settings: LLMSettings = {
        enabled: true,
        apiKey: "sk-123",
        apiUrl: "http://localhost:11434/v1",
        model: "gemma3:4b",
        maxTokens: 1000,
        temperature: 0.7,
      };

      // Convert the request data to content string
      const content = this.formatContentForSummarization(request);

      // Create LLM request
      const llmRequest = {
        content,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      };

      // Call LLM service
      const result = await this.llmService.summarizeLogs(llmRequest, settings);

      if (result.isFailure()) {
        return ResultFactory.failure(result.error);
      }

      // For now, use the same summary for both full and short
      // In a real implementation, you might want to generate different lengths
      const summary = result.data.summary;
      const shortSummary = this.createShortSummary(summary);

      return ResultFactory.success({
        fullSummary: summary,
        shortSummary,
      });
    } catch (error) {
      return ResultFactory.failure(
        error instanceof Error ? error : new Error("Failed to generate summary")
      );
    }
  }

  private formatContentForSummarization(
    request: LLMSummarizationRequest
  ): string {
    const { type, data, context } = request;

    let content = "";

    // Add context information
    if (context) {
      content += this.formatContext(type, context);
    }

    // Add data
    if (Array.isArray(data)) {
      // For weekly/monthly summaries (array of strings)
      content += "\n\nPrevious summaries:\n";
      data.forEach((summary, index) => {
        content += `${index + 1}. ${summary}\n`;
      });
    } else {
      // For daily summaries (SummaryData object)
      content += this.formatSummaryData(data as SummaryData);
    }

    // Add summarization instruction
    content += this.getSummarizationInstruction(type);

    return content;
  }

  private formatContext(type: SummaryType, context: any): string {
    switch (type) {
      case SummaryType.DAILY:
        return `Daily summary for ${context.date?.toString() || "unknown date"}`;
      case SummaryType.WEEKLY:
        return `Weekly summary from ${context.weekStart?.toString()} to ${context.weekEnd?.toString()}`;
      case SummaryType.MONTHLY:
        return `Monthly summary for ${context.month || "unknown month"}`;
      default:
        return "Summary";
    }
  }

  private formatSummaryData(data: SummaryData): string {
    let content = "\n\nActivity data:\n";

    if (data.tasks && data.tasks.length > 0) {
      content += "\nTasks:\n";
      data.tasks.forEach((task) => {
        content += `- ${task.title} (${task.status})\n`;
      });
    }

    // Note: SummaryData doesn't have logs property in current implementation
    // This would need to be added to SummaryData interface if needed

    return content;
  }

  private getSummarizationInstruction(type: SummaryType): string {
    switch (type) {
      case SummaryType.DAILY:
        return "\n\nPlease provide a comprehensive summary of the daily activities, including completed tasks, progress made, and any notable events.";
      case SummaryType.WEEKLY:
        return "\n\nPlease provide a weekly summary based on the daily summaries above, highlighting key achievements, patterns, and overall progress.";
      case SummaryType.MONTHLY:
        return "\n\nPlease provide a monthly summary based on the weekly summaries above, focusing on major accomplishments, trends, and overall monthly progress.";
      default:
        return "\n\nPlease provide a summary of the provided information.";
    }
  }

  private createShortSummary(fullSummary: string): string {
    // Simple implementation: take first 2 sentences or first 200 characters
    const sentences = fullSummary.split(". ");
    if (sentences.length >= 2) {
      return sentences.slice(0, 2).join(". ") + ".";
    }

    if (fullSummary.length > 200) {
      return fullSummary.substring(0, 200) + "...";
    }

    return fullSummary;
  }
}
