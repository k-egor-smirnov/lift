import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";
import { TaskRepository } from "../../../../shared/domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../../../shared/domain/repositories/DailySelectionRepository";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { Task } from "../../../../shared/domain/entities/Task";
import { UserSettingsService } from "./UserSettingsService";
import { DailySelectionService } from "../../domain/services/DailySelectionService";
import { TaskLogService } from "../../../../shared/application/services/TaskLogService";
import { AddTaskToTodayUseCase } from "../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import { RemoveTaskFromTodayUseCase } from "../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { CreateSystemLogUseCase } from "../../../../shared/application/use-cases/CreateSystemLogUseCase";
import { EventBus } from "../../../../shared/domain/events/EventBus";
import { container, tokens } from "../../../../shared/infrastructure/di";

/**
 * Data aggregated for the daily modal
 */
export interface DailyModalData {
  unfinishedTasks: Task[];
  overdueInboxTasks: Task[];
  regularInboxTasks: Task[];
  motivationalMessage: string;
  shouldShow: boolean;
  date: string;
}

/**
 * Service for managing onboarding and daily modal functionality
 */
export class OnboardingService {
  private readonly MORNING_WINDOW_START = 6; // 6 AM
  private readonly MORNING_WINDOW_END = 11; // 11 AM
  private readonly DEFAULT_OVERDUE_DAYS = 3;

  private readonly motivationalMessages = [
    "Ready to make today amazing? Let's tackle your tasks!",
    "A new day, a fresh start! What will you accomplish today?",
    "Every small step counts. Let's begin your productive day!",
    "Today is full of possibilities. Which tasks will you conquer?",
    "Your future self will thank you for what you do today!",
    "Progress, not perfection. Let's make today count!",
    "Great things happen when you stay focused. Ready to start?",
    "Today's efforts are tomorrow's results. Let's get started!",
    "You've got this! Time to turn your plans into action.",
    "Success is built one task at a time. Let's begin!",
  ];

  private readonly createSystemLogUseCase: CreateSystemLogUseCase;

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly dailySelectionRepository: DailySelectionRepository,
    private readonly logService: TaskLogService,
    private readonly userSettingsService?: UserSettingsService
  ) {
    // Get EventBus from DI container
    const eventBus = container.resolve<EventBus>(tokens.EVENT_BUS_TOKEN);

    // Create use cases
    const addTaskToTodayUseCase = new AddTaskToTodayUseCase(
      dailySelectionRepository,
      taskRepository,
      eventBus
    );

    const removeTaskFromTodayUseCase = new RemoveTaskFromTodayUseCase(
      dailySelectionRepository,
      eventBus
    );

    this.createSystemLogUseCase = new CreateSystemLogUseCase();

    // Initialize DailySelectionService for task management
    this.dailySelectionService = new DailySelectionService(
      taskRepository,
      dailySelectionRepository,
      logService,
      addTaskToTodayUseCase,
      removeTaskFromTodayUseCase,
      this.createSystemLogUseCase
    );
  }

  private readonly dailySelectionService: DailySelectionService;

  /**
   * Check if we're in the morning window (6-11 AM local time)
   */
  isInMorningWindow(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour >= this.MORNING_WINDOW_START && hour < this.MORNING_WINDOW_END;
  }

  /**
   * Get a random motivational message
   */
  getRandomMotivationalMessage(): string {
    const randomIndex = Math.floor(
      Math.random() * this.motivationalMessages.length
    );
    return this.motivationalMessages[randomIndex];
  }

  /**
   * Get unfinished tasks from yesterday's daily selection
   */
  async getUnfinishedTasksFromYesterday(): Promise<Task[]> {
    const yesterday = DateOnly.yesterday();
    const yesterdayEntries =
      await this.dailySelectionRepository.getTasksForDay(yesterday);

    const unfinishedTasks: Task[] = [];

    for (const entry of yesterdayEntries) {
      // Only get tasks that weren't completed in the daily selection
      if (!entry.completedFlag) {
        const task = await this.taskRepository.findById(entry.taskId);
        // Include task if it exists, is not deleted, and is still active
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
   * Aggregate all data needed for the daily modal
   */
  async aggregateDailyModalData(overdueDays?: number): Promise<DailyModalData> {
    const [unfinishedTasks, overdueInboxTasks, regularInboxTasks] =
      await Promise.all([
        this.getUnfinishedTasksFromYesterday(),
        this.getOverdueInboxTasks(overdueDays),
        this.getRegularInboxTasks(overdueDays),
      ]);

    const shouldShow =
      this.isInMorningWindow() &&
      (unfinishedTasks.length > 0 ||
        overdueInboxTasks.length > 0 ||
        regularInboxTasks.length > 0);

    return {
      unfinishedTasks,
      overdueInboxTasks,
      regularInboxTasks,
      motivationalMessage: this.getRandomMotivationalMessage(),
      shouldShow,
      date: DateOnly.today().value,
    };
  }

  /**
   * Check if modal should be shown based on time and content
   */
  async shouldShowDailyModal(overdueDays?: number): Promise<boolean> {
    if (!this.isInMorningWindow()) {
      return false;
    }

    const [unfinishedTasks, overdueInboxTasks, regularInboxTasks] =
      await Promise.all([
        this.getUnfinishedTasksFromYesterday(),
        this.getOverdueInboxTasks(overdueDays),
        this.getRegularInboxTasks(overdueDays),
      ]);

    const shouldShow =
      unfinishedTasks.length > 0 ||
      overdueInboxTasks.length > 0 ||
      regularInboxTasks.length > 0;

    // Log modal check
    await this.createSystemLogUseCase.execute({
      taskId: "system",
      action: "daily_modal_check",
      metadata: {
        shouldShow,
        unfinishedCount: unfinishedTasks.length,
        overdueCount: overdueInboxTasks.length,
        regularCount: regularInboxTasks.length,
      },
    });

    return shouldShow;
  }

  /**
   * Get the DailySelectionService instance for task management
   */
  getDailySelectionService(): DailySelectionService {
    return this.dailySelectionService;
  }

  /**
   * Handle new day transition - clear previous day's selection
   */
  async handleNewDayTransition(): Promise<void> {
    try {
      await this.dailySelectionService.clearTodaySelection();

      await this.createSystemLogUseCase.execute({
        taskId: "system",
        action: "new_day_transition",
        metadata: { date: DateOnly.today().value },
      });
    } catch (error) {
      console.error("Error handling new day transition:", error);
      await this.createSystemLogUseCase.execute({
        taskId: "system",
        action: "new_day_transition_error",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}
