import {
  TodoDatabase,
  TaskLogRecord,
} from "../../../../shared/infrastructure/database/TodoDatabase";

/**
 * Configuration for log retention policy
 */
export interface LogRetentionConfig {
  maxDaysForUserLogs: number; // Default 180 days
  maxLogsPerTask: number; // Default 50 logs per task
  cleanupIntervalMs: number; // How often to run cleanup (default 24 hours)
}

/**
 * Statistics about log cleanup operation
 */
export interface LogCleanupStats {
  totalLogsProcessed: number;
  userLogsDeleted: number;
  systemLogsDeleted: number;
  conflictLogsDeleted: number;
  tasksProcessed: number;
  cleanupDurationMs: number;
}

/**
 * Service for managing log retention and cleanup
 */
export class LogRetentionService {
  private static readonly DEFAULT_CONFIG: LogRetentionConfig = {
    maxDaysForUserLogs: 180,
    maxLogsPerTask: 50,
    cleanupIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  };

  private cleanupTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly database: TodoDatabase,
    private readonly config: LogRetentionConfig = LogRetentionService.DEFAULT_CONFIG
  ) {}

  /**
   * Start the background cleanup process
   */
  startBackgroundCleanup(): void {
    if (this.cleanupTimer) {
      this.stopBackgroundCleanup();
    }

    // Run initial cleanup
    this.runCleanup().catch((error) => {
      console.error("Initial log cleanup failed:", error);
    });

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.runCleanup().catch((error) => {
        console.error("Scheduled log cleanup failed:", error);
      });
    }, this.config.cleanupIntervalMs);

    console.log("Log retention background cleanup started");
  }

  /**
   * Stop the background cleanup process
   */
  stopBackgroundCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    console.log("Log retention background cleanup stopped");
  }

  /**
   * Run log cleanup manually
   */
  async runCleanup(): Promise<LogCleanupStats> {
    if (this.isRunning) {
      console.log("Log cleanup already running, skipping...");
      return {
        totalLogsProcessed: 0,
        userLogsDeleted: 0,
        systemLogsDeleted: 0,
        conflictLogsDeleted: 0,
        tasksProcessed: 0,
        cleanupDurationMs: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log("Starting log retention cleanup...");

      const stats: LogCleanupStats = {
        totalLogsProcessed: 0,
        userLogsDeleted: 0,
        systemLogsDeleted: 0,
        conflictLogsDeleted: 0,
        tasksProcessed: 0,
        cleanupDurationMs: 0,
      };

      // Step 1: Clean up old USER logs (older than maxDaysForUserLogs)
      await this.cleanupOldUserLogs(stats);

      // Step 2: Clean up excess logs per task (keeping maxLogsPerTask most recent)
      await this.cleanupExcessLogsPerTask(stats);

      stats.cleanupDurationMs = Date.now() - startTime;

      console.log("Log retention cleanup completed:", stats);
      return stats;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up USER logs older than the configured retention period
   */
  private async cleanupOldUserLogs(stats: LogCleanupStats): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxDaysForUserLogs);

    const oldUserLogs = await this.database.taskLogs
      .where("type")
      .equals("USER")
      .and((log) => log.createdAt < cutoffDate)
      .toArray();

    stats.totalLogsProcessed += oldUserLogs.length;

    if (oldUserLogs.length > 0) {
      const logIds = oldUserLogs.map((log) => log.id!);
      await this.database.taskLogs.bulkDelete(logIds);
      stats.userLogsDeleted += oldUserLogs.length;

      console.log(
        `Deleted ${oldUserLogs.length} old USER logs (older than ${this.config.maxDaysForUserLogs} days)`
      );
    }
  }

  /**
   * Clean up excess logs per task, keeping only the most recent ones
   */
  private async cleanupExcessLogsPerTask(
    stats: LogCleanupStats
  ): Promise<void> {
    // Get all unique task IDs that have logs
    const allLogs = await this.database.taskLogs.toArray();
    const taskIds = [
      ...new Set(allLogs.map((log) => log.taskId).filter(Boolean)),
    ];

    stats.tasksProcessed = taskIds.length;

    for (const taskId of taskIds) {
      await this.cleanupLogsForTask(taskId!, stats);
    }

    // Also handle custom logs (logs without taskId)
    await this.cleanupCustomLogs(stats);
  }

  /**
   * Clean up logs for a specific task
   */
  private async cleanupLogsForTask(
    taskId: string,
    stats: LogCleanupStats
  ): Promise<void> {
    const taskLogs = await this.database.taskLogs
      .where("taskId")
      .equals(taskId)
      .reverse() // Most recent first
      .sortBy("createdAt");

    if (taskLogs.length <= this.config.maxLogsPerTask) {
      return; // No cleanup needed
    }

    // Separate logs by type for prioritized deletion
    const userLogs = taskLogs.filter((log) => log.type === "USER");
    const systemLogs = taskLogs.filter((log) => log.type === "SYSTEM");
    const conflictLogs = taskLogs.filter((log) => log.type === "CONFLICT");

    const logsToDelete: TaskLogRecord[] = [];

    // Priority 1: Delete excess USER logs first (keep most recent)
    if (userLogs.length > Math.floor(this.config.maxLogsPerTask * 0.6)) {
      const excessUserLogs = userLogs.slice(
        Math.floor(this.config.maxLogsPerTask * 0.6)
      );
      logsToDelete.push(...excessUserLogs);
    }

    // Priority 2: Delete excess SYSTEM logs if still over limit
    const remainingCapacity =
      this.config.maxLogsPerTask - (taskLogs.length - logsToDelete.length);
    if (remainingCapacity < 0) {
      const systemLogsToDelete = systemLogs.slice(
        Math.max(0, systemLogs.length + remainingCapacity)
      );
      logsToDelete.push(...systemLogsToDelete);
    }

    // Priority 3: Keep CONFLICT logs as they're important for debugging
    // Only delete if absolutely necessary
    const finalRemainingCapacity =
      this.config.maxLogsPerTask - (taskLogs.length - logsToDelete.length);
    if (finalRemainingCapacity < 0) {
      const conflictLogsToDelete = conflictLogs.slice(
        Math.max(0, conflictLogs.length + finalRemainingCapacity)
      );
      logsToDelete.push(...conflictLogsToDelete);
    }

    if (logsToDelete.length > 0) {
      const logIds = logsToDelete.map((log) => log.id!);
      await this.database.taskLogs.bulkDelete(logIds);

      // Update stats
      logsToDelete.forEach((log) => {
        switch (log.type) {
          case "USER":
            stats.userLogsDeleted++;
            break;
          case "SYSTEM":
            stats.systemLogsDeleted++;
            break;
          case "CONFLICT":
            stats.conflictLogsDeleted++;
            break;
        }
      });

      console.log(
        `Deleted ${logsToDelete.length} excess logs for task ${taskId}`
      );
    }
  }

  /**
   * Clean up custom logs (logs without taskId)
   */
  private async cleanupCustomLogs(stats: LogCleanupStats): Promise<void> {
    const customLogs = await this.database.taskLogs
      .where("taskId")
      .equals(undefined)
      .reverse()
      .sortBy("createdAt");

    if (customLogs.length <= this.config.maxLogsPerTask) {
      return; // No cleanup needed
    }

    const logsToDelete = customLogs.slice(this.config.maxLogsPerTask);

    if (logsToDelete.length > 0) {
      const logIds = logsToDelete.map((log) => log.id!);
      await this.database.taskLogs.bulkDelete(logIds);

      // Update stats
      logsToDelete.forEach((log) => {
        switch (log.type) {
          case "USER":
            stats.userLogsDeleted++;
            break;
          case "SYSTEM":
            stats.systemLogsDeleted++;
            break;
          case "CONFLICT":
            stats.conflictLogsDeleted++;
            break;
        }
      });

      console.log(`Deleted ${logsToDelete.length} excess custom logs`);
    }
  }

  /**
   * Get current log statistics
   */
  async getLogStatistics(): Promise<{
    totalLogs: number;
    userLogs: number;
    systemLogs: number;
    conflictLogs: number;
    tasksWithLogs: number;
    customLogs: number;
  }> {
    const [totalLogs, userLogs, systemLogs, conflictLogs] = await Promise.all([
      this.database.taskLogs.count(),
      this.database.taskLogs.where("type").equals("USER").count(),
      this.database.taskLogs.where("type").equals("SYSTEM").count(),
      this.database.taskLogs.where("type").equals("CONFLICT").count(),
    ]);

    const allLogs = await this.database.taskLogs.toArray();
    const tasksWithLogs = new Set(
      allLogs.map((log) => log.taskId).filter(Boolean)
    ).size;
    const customLogs = allLogs.filter((log) => !log.taskId).length;

    return {
      totalLogs,
      userLogs,
      systemLogs,
      conflictLogs,
      tasksWithLogs,
      customLogs,
    };
  }

  /**
   * Check if cleanup is currently running
   */
  isCleanupRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfig(): LogRetentionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LogRetentionConfig>): void {
    Object.assign(this.config, newConfig);

    // Restart background cleanup with new config
    if (this.cleanupTimer) {
      this.stopBackgroundCleanup();
      this.startBackgroundCleanup();
    }
  }
}
