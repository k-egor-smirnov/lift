import { UseCase } from "../UseCase";
import type { Result } from "../../domain/Result";
import { ResultFactory } from "../../domain/Result";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import { Summary, SummaryType } from "../../domain/entities/Summary";
import { injectable, inject } from "tsyringe";
import * as tokens from "../../infrastructure/di/tokens";

export interface SyncHistoryRequest {
  type?: SummaryType;
  limit?: number;
  offset?: number;
}

export interface SyncHistoryResponse {
  summaries: Summary[];
  total: number;
  hasMore: boolean;
}

/**
 * Use case for retrieving synchronization history
 */
@injectable()
export class GetSyncHistoryUseCase
  implements UseCase<SyncHistoryRequest, SyncHistoryResponse>
{
  constructor(
    @inject(tokens.SUMMARY_REPOSITORY_TOKEN)
    private readonly summaryRepository: SummaryRepository
  ) {}

  async execute(
    request: SyncHistoryRequest
  ): Promise<Result<SyncHistoryResponse, Error>> {
    try {
      const { type, limit = 20, offset = 0 } = request;

      // Get summaries with optional type filter
      const summariesResult = await this.summaryRepository.findAll({
        type,
        limit,
        offset,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      if (!summariesResult.success) {
        return ResultFactory.failure(summariesResult.error);
      }

      const summaries = summariesResult.data;
      const hasMore = summaries.length === limit;

      return ResultFactory.success({
        summaries,
        total: summaries.length,
        hasMore,
      });
    } catch (error) {
      return ResultFactory.failure(
        error instanceof Error ? error : new Error("Failed to get sync history")
      );
    }
  }
}
