import { describe, it, expect, beforeEach, vi } from "vitest";
import { GetTaskLogsUseCase, GetTaskLogsRequest } from "../GetTaskLogsUseCase";
import {
  TodoDatabase,
  TaskLogRecord,
} from "../../../infrastructure/database/TodoDatabase";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { ResultUtils } from "../../../domain/Result";

// Mock database with Dexie-like interface
const mockCollection = {
  count: vi.fn(),
  and: vi.fn(),
  reverse: vi.fn(),
  offset: vi.fn(),
  limit: vi.fn(),
  toArray: vi.fn(),
};

const mockQuery = {
  count: vi.fn(),
  and: vi.fn(),
  reverse: vi.fn(),
  offset: vi.fn(),
  limit: vi.fn(),
  toArray: vi.fn(),
};

const mockDatabase = {
  taskLogs: {
    toCollection: vi.fn(),
    where: vi.fn(),
  },
} as unknown as TodoDatabase;

describe("GetTaskLogsUseCase", () => {
  let useCase: GetTaskLogsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup method chaining for mock collection
    mockCollection.and.mockReturnValue(mockCollection);
    mockCollection.reverse.mockReturnValue(mockCollection);
    mockCollection.offset.mockReturnValue(mockCollection);
    mockCollection.limit.mockReturnValue(mockCollection);

    mockQuery.and.mockReturnValue(mockQuery);
    mockQuery.reverse.mockReturnValue(mockQuery);
    mockQuery.offset.mockReturnValue(mockQuery);
    mockQuery.limit.mockReturnValue(mockQuery);

    // Setup where method to return a mock that has equals method
    const mockWhereResult = {
      equals: vi.fn().mockReturnValue(mockQuery),
      and: vi.fn().mockReturnValue(mockQuery),
      reverse: vi.fn().mockReturnValue(mockQuery),
      offset: vi.fn().mockReturnValue(mockQuery),
      limit: vi.fn().mockReturnValue(mockQuery),
      count: vi.fn(),
      toArray: vi.fn(),
    };

    vi.mocked(mockDatabase.taskLogs.toCollection).mockReturnValue(
      mockCollection
    );
    vi.mocked(mockDatabase.taskLogs.where).mockReturnValue(mockWhereResult);

    useCase = new GetTaskLogsUseCase(mockDatabase);
  });

  describe("execute", () => {
    it("should get all logs with default pagination", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [
        {
          id: 1,
          taskId: "task_1",
          type: "USER",
          message: "User log 1",
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
        {
          id: 2,
          taskId: "task_2",
          type: "SYSTEM",
          message: "System log 1",
          createdAt: new Date("2024-01-15T11:00:00Z"),
        },
      ];

      mockCollection.count.mockResolvedValue(2);
      mockCollection.toArray.mockResolvedValue(mockLogs);

      const request: GetTaskLogsRequest = {};

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        const response = result.data;
        expect(response.logs).toHaveLength(2);
        expect(response.pagination.page).toBe(1);
        expect(response.pagination.pageSize).toBe(20);
        expect(response.pagination.totalCount).toBe(2);
        expect(response.pagination.totalPages).toBe(1);
        expect(response.pagination.hasNextPage).toBe(false);
        expect(response.pagination.hasPreviousPage).toBe(false);
      }

      expect(mockDatabase.taskLogs.toCollection).toHaveBeenCalled();
      expect(mockCollection.reverse).toHaveBeenCalled(); // Default desc order
      expect(mockCollection.offset).toHaveBeenCalledWith(0);
      expect(mockCollection.limit).toHaveBeenCalledWith(20);
    });

    it("should filter logs by task ID", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const mockLogs: TaskLogRecord[] = [
        {
          id: 1,
          taskId: taskId.value,
          type: "USER",
          message: "Task-specific log",
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
      ];

      // Setup the where chain properly
      const mockWhereResult = vi
        .mocked(mockDatabase.taskLogs.where)
        .mockReturnValue({
          equals: vi.fn().mockReturnValue({
            count: vi.fn().mockResolvedValue(1),
            reverse: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  toArray: vi.fn().mockResolvedValue(mockLogs),
                }),
              }),
            }),
          }),
        } as any);

      const request: GetTaskLogsRequest = {
        taskId: taskId.value,
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.logs).toHaveLength(1);
        expect(result.data.logs[0].taskId).toBe(taskId.value);
      }

      expect(mockDatabase.taskLogs.where).toHaveBeenCalledWith("taskId");
    });

    it("should filter logs by type", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [
        {
          id: 1,
          type: "SYSTEM",
          message: "System log",
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
      ];

      mockQuery.count.mockResolvedValue(1);
      mockQuery.toArray.mockResolvedValue(mockLogs);

      const request: GetTaskLogsRequest = {
        logType: "SYSTEM",
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.logs).toHaveLength(1);
        expect(result.data.logs[0].type).toBe("SYSTEM");
      }

      expect(mockDatabase.taskLogs.where).toHaveBeenCalledWith("type");
    });

    it("should handle pagination correctly", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [
        {
          id: 3,
          type: "USER",
          message: "Page 2 log",
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
      ];

      mockCollection.count.mockResolvedValue(25); // Total 25 logs
      mockCollection.toArray.mockResolvedValue(mockLogs);

      const request: GetTaskLogsRequest = {
        page: 2,
        pageSize: 10,
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        const response = result.data;
        expect(response.pagination.page).toBe(2);
        expect(response.pagination.pageSize).toBe(10);
        expect(response.pagination.totalCount).toBe(25);
        expect(response.pagination.totalPages).toBe(3);
        expect(response.pagination.hasNextPage).toBe(true);
        expect(response.pagination.hasPreviousPage).toBe(true);
      }

      expect(mockCollection.offset).toHaveBeenCalledWith(10); // (page - 1) * pageSize
      expect(mockCollection.limit).toHaveBeenCalledWith(10);
    });

    it("should handle ascending sort order", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [];
      mockCollection.count.mockResolvedValue(0);
      mockCollection.toArray.mockResolvedValue(mockLogs);

      const request: GetTaskLogsRequest = {
        sortOrder: "asc",
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockCollection.reverse).not.toHaveBeenCalled(); // No reverse for asc
      expect(mockCollection.toArray).toHaveBeenCalled();
    });

    it("should limit page size to maximum", async () => {
      // Arrange
      mockCollection.count.mockResolvedValue(0);
      mockCollection.toArray.mockResolvedValue([]);

      const request: GetTaskLogsRequest = {
        pageSize: 200, // Exceeds max of 100
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.pagination.pageSize).toBe(100);
      }

      expect(mockCollection.limit).toHaveBeenCalledWith(100);
    });

    it("should handle minimum page and page size", async () => {
      // Arrange
      mockCollection.count.mockResolvedValue(0);
      mockCollection.toArray.mockResolvedValue([]);

      const request: GetTaskLogsRequest = {
        page: 0, // Should be corrected to 1
        pageSize: 0, // Should be corrected to 1
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.pagination.page).toBe(1);
        expect(result.data.pagination.pageSize).toBe(1);
      }

      expect(mockCollection.offset).toHaveBeenCalledWith(0);
      expect(mockCollection.limit).toHaveBeenCalledWith(1);
    });

    it("should fail with invalid task ID", async () => {
      // Arrange
      const request: GetTaskLogsRequest = {
        taskId: "INVALID_TASK_ID_FORMAT",
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TASK_ID");
      }
    });

    it("should handle database failure", async () => {
      // Arrange
      mockCollection.count.mockRejectedValue(new Error("Database error"));

      // Act
      const result = await useCase.execute();

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("GET_FAILED");
        expect(result.error.message).toContain("Database error");
      }
    });

    it("should convert database records to log entries correctly", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [
        {
          id: 1,
          taskId: "task_1",
          type: "USER",
          message: "Test message",
          metadata: { key: "value" },
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
      ];

      mockCollection.count.mockResolvedValue(1);
      mockCollection.toArray.mockResolvedValue(mockLogs);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        const logEntry = result.data.logs[0];
        expect(logEntry.id).toBe(1);
        expect(logEntry.taskId).toBe("task_1");
        expect(logEntry.type).toBe("USER");
        expect(logEntry.message).toBe("Test message");
        expect(logEntry.metadata).toEqual({ key: "value" });
        expect(logEntry.createdAt).toEqual(new Date("2024-01-15T10:00:00Z"));
      }
    });
  });

  describe("getLogsForTask", () => {
    it("should get logs for specific task with default settings", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const mockLogs: TaskLogRecord[] = [];

      mockQuery.count.mockResolvedValue(0);
      mockQuery.toArray.mockResolvedValue(mockLogs);

      // Act
      const result = await useCase.getLogsForTask(taskId.value);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockDatabase.taskLogs.where).toHaveBeenCalledWith("taskId");
    });
  });

  describe("getRecentLogs", () => {
    it("should get recent logs with default limit", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [];

      mockCollection.count.mockResolvedValue(0);
      mockCollection.toArray.mockResolvedValue(mockLogs);

      // Act
      const result = await useCase.getRecentLogs();

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data).toEqual([]);
      }

      expect(mockCollection.limit).toHaveBeenCalledWith(20);
      expect(mockCollection.reverse).toHaveBeenCalled(); // Desc order
    });

    it("should respect custom limit", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [];

      mockCollection.count.mockResolvedValue(0);
      mockCollection.toArray.mockResolvedValue(mockLogs);

      // Act
      const result = await useCase.getRecentLogs(50);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockCollection.limit).toHaveBeenCalledWith(50);
    });

    it("should limit to maximum page size", async () => {
      // Arrange
      const mockLogs: TaskLogRecord[] = [];

      mockCollection.count.mockResolvedValue(0);
      mockCollection.toArray.mockResolvedValue(mockLogs);

      // Act
      const result = await useCase.getRecentLogs(200);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockCollection.limit).toHaveBeenCalledWith(100); // Max limit
    });
  });
});
