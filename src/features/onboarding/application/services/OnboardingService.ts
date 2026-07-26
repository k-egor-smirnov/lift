import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";
import { TaskRepository } from "../../../../shared/domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../../../shared/domain/repositories/DailySelectionRepository";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { Task } from "../../../../shared/domain/entities/Task";
import { UserSettingsService } from "./UserSettingsService";
import { DailySelectionService } from "./DailySelectionService";
import { AddTaskToTodayUseCase } from "../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import { RemoveTaskFromTodayUseCase } from "../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { GetTodayTasksUseCase } from "../../../../shared/application/use-cases/GetTodayTasksUseCase";
import { CreateSystemLogUseCase } from "../../../../shared/application/use-cases/CreateSystemLogUseCase";
import i18n from "../../../../shared/lib/i18n";
import type { OnboardingDateContext } from "../ports/OnboardingDateContext";

/**
 * Data aggregated for the daily modal
 */
export interface DailyModalData {
  previousDayTasks: Task[];
  overdueInboxTasks: Task[];
  dueDeferredTasks: Task[];
  regularInboxTasks: Task[];
  motivationalMessage: string;
  shouldShow: boolean;
  date: string;
}

/**
 * Service for managing onboarding and daily modal functionality
 */
export class OnboardingService {
  private readonly DEFAULT_OVERDUE_DAYS = 3;

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly dailySelectionRepository: DailySelectionRepository,
    getTodayTasksUseCase: Pick<GetTodayTasksUseCase, "execute">,
    addTaskToTodayUseCase: Pick<AddTaskToTodayUseCase, "execute">,
    removeTaskFromTodayUseCase: Pick<RemoveTaskFromTodayUseCase, "execute">,
    private readonly createSystemLogUseCase: Pick<
      CreateSystemLogUseCase,
      "execute"
    >,
    private readonly dates: OnboardingDateContext,
    private readonly userSettingsService?: UserSettingsService
  ) {
    // Initialize DailySelectionService for task management
    this.dailySelectionService = new DailySelectionService(
      getTodayTasksUseCase,
      addTaskToTodayUseCase,
      removeTaskFromTodayUseCase,
      this.createSystemLogUseCase
    );
  }

  private readonly dailySelectionService: DailySelectionService;

  /**
   * Check if we're past the start-of-day time (local time)
   */
  async isInMorningWindow(): Promise<boolean> {
    return this.dates.isAfterStartOfDay();
  }

  /**
   * Get a random motivational message
   */
  getRandomMotivationalMessage(): string {
    const randomIndex = Math.floor(Math.random() * 10) + 1;
    return i18n.t(`dailyModal.motivational.${randomIndex}`);
  }

  /**
   * Get unfinished tasks from yesterday's daily selection
   */
  async getUnfinishedTasksFromYesterday(): Promise<Task[]> {
    const yesterday = await this.getPreviousSelectionDate();
    const yesterdayEntries =
      await this.dailySelectionRepository.getTasksForDay(yesterday);

    const unfinishedTasks: Task[] = [];

    for (const entry of yesterdayEntries) {
      if (!entry.completedFlag) {
        const task = await this.taskRepository.findById(entry.taskId);
        if (task && !task.isDeleted && task.status === TaskStatus.ACTIVE) {
          unfinishedTasks.push(task);
        }
      }
    }

    return unfinishedTasks;
  }

  /**
   * Get overdue inbox tasks
   */
  async getOverdueInboxTasks(overdueDays?: number): Promise<Task[]> {
    let days = overdueDays;

    // Use user settings if available and no explicit days provided
    if (days === undefined && this.userSettingsService) {
      try {
        days = await this.userSettingsService.getInboxOverdueDays();
      } catch (error) {
        console.warn(
          "Failed to get inbox overdue days from settings, using default:",
          error
        );
        days = this.DEFAULT_OVERDUE_DAYS;
      }
    }

    // Fallback to default if still undefined
    if (days === undefined) {
      days = this.DEFAULT_OVERDUE_DAYS;
    }

    return await this.taskRepository.findOverdueTasks(days);
  }

  /**
   * Get regular (non-overdue) inbox tasks
   */
  async getRegularInboxTasks(overdueDays?: number): Promise<Task[]> {
    let days = overdueDays;

    // Use user settings if available and no explicit days provided
    if (days === undefined && this.userSettingsService) {
      try {
        days = await this.userSettingsService.getInboxOverdueDays();
      } catch (error) {
        console.warn(
          "Failed to get inbox overdue days from settings, using default:",
          error
        );
        days = this.DEFAULT_OVERDUE_DAYS;
      }
    }

    // Fallback to default if still undefined
    if (days === undefined) {
      days = this.DEFAULT_OVERDUE_DAYS;
    }

    // Get all inbox tasks and filter out overdue ones
    const allInboxTasks = await this.taskRepository.findByCategoryAndStatus(
      TaskCategory.INBOX,
      TaskStatus.ACTIVE
    );

    return allInboxTasks.filter((task) => !task.isOverdue(days));
  }

  /**
   * Get tasks that are due today from deferred
   */
  async getDueDeferredTasks(): Promise<Task[]> {
    const today = await this.getEffectiveDate();
    return this.getDueDeferredTasksForDate(today);
  }

  private async getDueDeferredTasksForDate(date: DateOnly): Promise<Task[]> {
    const deferredTasks = await this.taskRepository.findByCategoryAndStatus(
      TaskCategory.DEFERRED,
      TaskStatus.ACTIVE
    );

    return deferredTasks.filter((task) => {
      if (!task.deferredUntil) return false;
      const deferredDate = DateOnly.fromDate(task.deferredUntil);
      return deferredDate.value <= date.value;
    });
  }

  /**
   * Aggregate all data needed for the daily modal
   */
  async aggregateDailyModalData(overdueDays?: number): Promise<DailyModalData> {
    const [
      previousDayTasks,
      overdueInboxTasks,
      dueDeferredTasks,
      regularInboxTasks,
    ] = await Promise.all([
      this.getUnfinishedTasksFromYesterday(),
      this.getOverdueInboxTasks(overdueDays),
      this.getDueDeferredTasks(),
      this.getRegularInboxTasks(overdueDays),
    ]);

    const shouldShow =
      (await this.isInMorningWindow()) &&
      (previousDayTasks.length > 0 ||
        overdueInboxTasks.length > 0 ||
        dueDeferredTasks.length > 0 ||
        regularInboxTasks.length > 0);

    return {
      previousDayTasks,
      overdueInboxTasks,
      dueDeferredTasks,
      regularInboxTasks,
      motivationalMessage: this.getRandomMotivationalMessage(),
      shouldShow,
      date: (await this.getEffectiveDate()).value,
    };
  }

  /**
   * Check if modal should be shown based on time and content
   */
  async shouldShowDailyModal(
    overdueDays?: number,
    options?: { log?: boolean }
  ): Promise<boolean> {
    if (!(await this.isInMorningWindow())) {
      return false;
    }

    const [
      unfinishedTasks,
      overdueInboxTasks,
      dueDeferredTasks,
      regularInboxTasks,
    ] = await Promise.all([
      this.getUnfinishedTasksFromYesterday(),
      this.getOverdueInboxTasks(overdueDays),
      this.getDueDeferredTasks(),
      this.getRegularInboxTasks(overdueDays),
    ]);

    const shouldShow =
      unfinishedTasks.length > 0 ||
      overdueInboxTasks.length > 0 ||
      dueDeferredTasks.length > 0 ||
      regularInboxTasks.length > 0;

    if (options?.log !== false) {
      // Log modal check
      await this.createSystemLogUseCase.execute({
        taskId: "system",
        action: "daily_modal_check",
        metadata: {
          shouldShow,
          unfinishedCount: unfinishedTasks.length,
          overdueCount: overdueInboxTasks.length,
          regularCount: regularInboxTasks.length,
          dueDeferredCount: dueDeferredTasks.length,
        },
      });
    }

    return shouldShow;
  }

  /**
   * Get the DailySelectionService instance for task management
   */
  getDailySelectionService(): DailySelectionService {
    return this.dailySelectionService;
  }

  private async getEffectiveDate(): Promise<DateOnly> {
    return this.dates.current();
  }

  private async getPreviousSelectionDate(): Promise<DateOnly> {
    const today = await this.getEffectiveDate();
    return today.subtractDays(1);
  }
}
