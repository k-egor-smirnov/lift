import { injectable, inject } from "tsyringe";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { DayResetRepository } from "../../domain/repositories/DayResetRepository";
import { Result, ResultUtils } from "../../domain/Result";
import * as tokens from "../../infrastructure/di/tokens";
import { DayResetUseCase, DayResetRequest } from "./DayResetUseCase";

/**
 * Request for checking day status
 */
export interface CheckDayStatusRequest {
  userId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
}

/**
 * Response for checking day status
 */
export interface CheckDayStatusResponse {
  wasResetPerformed: boolean;
  shouldShowModal: boolean;
  isRestoreAvailable: boolean;
  currentDate: string;
}

/**
 * Domain errors for day status check
 */
export class CheckDayStatusError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CheckDayStatusError";
  }
}

/**
 * Use case for checking day status and performing reset if needed
 * Returns information about whether reset was performed and modal state
 */
@injectable()
export class CheckDayStatusUseCase {
  constructor(
    @inject(tokens.DAY_RESET_REPOSITORY_TOKEN)
    private readonly dayResetRepository: DayResetRepository,
    @inject(tokens.DAY_RESET_USE_CASE_TOKEN)
    private readonly dayResetUseCase: DayResetUseCase
  ) {}

  async execute(
    request: CheckDayStatusRequest
  ): Promise<Result<CheckDayStatusResponse, CheckDayStatusError>> {
    try {
      // Parse date or use today
      let date: DateOnly;
      try {
        if (request.date) {
          date = DateOnly.fromString(request.date);
        } else {
          date = DateOnly.today();
        }
      } catch (error) {
        return ResultUtils.error(
          new CheckDayStatusError("Invalid date format", "INVALID_DATE")
        );
      }

      // Check if reset is needed
      const needsReset = await this.dayResetRepository.needsDayReset(
        request.userId,
        date
      );
      let wasResetPerformed = false;

      // Perform reset if needed
      if (needsReset) {
        const resetResult = await this.dayResetUseCase.execute({
          userId: request.userId,
          date: date.value,
        });

        if (resetResult.isError) {
          return ResultUtils.error(
            new CheckDayStatusError(
              `Failed to perform day reset: ${resetResult.error.message}`,
              "RESET_FAILED"
            )
          );
        }

        wasResetPerformed = !resetResult.value.isIdempotent;
      }

      // Check if modal should be shown
      const shouldShowModal =
        await this.dayResetRepository.shouldShowStartOfDayModal(
          request.userId,
          date
        );
      console.log("check 2", shouldShowModal, request.userId, date);

      // Check if restore is available
      const isRestoreAvailable =
        await this.dayResetRepository.isRestoreAvailable(request.userId, date);

      return ResultUtils.ok({
        wasResetPerformed,
        shouldShowModal,
        isRestoreAvailable,
        currentDate: date.value,
      });
    } catch (error) {
      return ResultUtils.error(
        new CheckDayStatusError(
          `Failed to check day status: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "CHECK_FAILED"
        )
      );
    }
  }
}
