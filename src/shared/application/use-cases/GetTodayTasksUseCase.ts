import { injectable, inject } from 'tsyringe';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { Task } from '../../domain/entities/Task';
import { DailySelectionRepository } from '../../domain/repositories/DailySelectionRepository';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { Result, ResultUtils } from '../../domain/Result';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Request for getting today's tasks
 */
export interface GetTodayTasksRequest {
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
  includeCompleted?: boolean; // Optional, defaults to true
}

/**
 * Task with daily selection status
 */
export interface TodayTaskInfo {
  task: Task;
  completedInSelection: boolean;
  selectedAt: Date;
}

/**
 * Response for getting today's tasks
 */
export interface GetTodayTasksResponse {
  tasks: TodayTaskInfo[];
  date: string;
  totalCount: number;
  completedCount: number;
  activeCount: number;
}

/**
 * Domain errors for getting today's tasks
 */
export class GetTodayTasksError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'GetTodayTasksError';
  }
}

/**
 * Use case for getting tasks selected for today
 */
@injectable()
export class GetTodayTasksUseCase {
  constructor(
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN) private readonly dailySelectionRepository: DailySelectionRepository,
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository
  ) {}

  async execute(request: GetTodayTasksRequest = {}): Promise<Result<GetTodayTasksResponse, GetTodayTasksError>> {
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
          new GetTodayTasksError('Invalid date format', 'INVALID_DATE')
        );
      }

      // Get daily selection entries for the date
      const dailySelectionEntries = await this.dailySelectionRepository.getTasksForDay(date);

      // Get the actual tasks
      const taskInfos: TodayTaskInfo[] = [];
      for (const entry of dailySelectionEntries) {
        // Filter by completion status if requested (before fetching task)
        if (request.includeCompleted === false && entry.completedFlag) {
          continue;
        }

        const task = await this.taskRepository.findById(entry.taskId);
        if (task && !task.isDeleted) {
          taskInfos.push({
            task,
            completedInSelection: entry.completedFlag,
            selectedAt: entry.createdAt
          });
        }
      }

      // Sort by selection time (most recent first)
      taskInfos.sort((a, b) => b.selectedAt.getTime() - a.selectedAt.getTime());

      // Calculate counts
      const totalCount = taskInfos.length;
      const completedCount = taskInfos.filter(info => info.completedInSelection || info.task.isCompleted).length;
      const activeCount = totalCount - completedCount;

      return ResultUtils.ok({
        tasks: taskInfos,
        date: date.value,
        totalCount,
        completedCount,
        activeCount
      });
    } catch (error) {
      return ResultUtils.error(
        new GetTodayTasksError(
          `Failed to get today's tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'GET_FAILED'
        )
      );
    }
  }
}