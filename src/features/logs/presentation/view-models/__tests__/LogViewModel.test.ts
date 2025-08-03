import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogViewModel, LogViewModelDependencies } from "../LogViewModel";
import {
  GetTaskLogsUseCase,
  LogEntry,
} from "../../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { CreateUserLogUseCase } from "../../../../../shared/application/use-cases/CreateUserLogUseCase";
import { ResultUtils } from "../../../../../shared/domain/Result";

// Mock dependencies
const mockGetTaskLogsUseCase = {
  execute: vi.fn(),
} as unknown as GetTaskLogsUseCase;

const mockCreateUserLogUseCase = {
  execute: vi.fn(),
} as unknown as CreateUserLogUseCase;

const dependencies: LogViewModelDependencies = {
  getTaskLogsUseCase: mockGetTaskLogsUseCase,
  createUserLogUseCase: mockCreateUserLogUseCase,
};

describe("LogViewModel", () => {
  let viewModel: ReturnType<typeof createLogViewModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    viewModel = createLogViewModel(dependencies);
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = viewModel.getState();

      expect(state.logs).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.filter.sortOrder).toBe("desc");
      expect(state.pagination.page).toBe(1);
      expect(state.pagination.pageSize).toBe(20);
    });
  });

  describe("loadLogs", () => {
    it("should load logs successfully", async () => {
      const mockLogs: LogEntry[] = [
        {
          id: 1,
          taskId: "task-1",
          type: "USER",
          message: "Test log",
          createdAt: new Date(),
        },
      ];

      const mockResponse = {
        logs: mockLogs,
        pagination: {
          page: 1,
          pageSize: 20,
          totalCount: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(mockGetTaskLogsUseCase.execute).mockResolvedValue(
        ResultUtils.ok(mockResponse)
      );

      await viewModel.getState().loadLogs();

      const state = viewModel.getState();
      expect(state.logs).toEqual(mockLogs);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.pagination).toEqual(mockResponse.pagination);
    });

    it("should handle load logs error", async () => {
      const errorMessage = "Failed to load logs";
      vi.mocked(mockGetTaskLogsUseCase.execute).mockResolvedValue(
        ResultUtils.error({ message: errorMessage } as any)
      );

      await viewModel.getState().loadLogs();

      const state = viewModel.getState();
      expect(state.logs).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });

    it("should set loading state during load", async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(mockGetTaskLogsUseCase.execute).mockReturnValue(promise);

      const loadPromise = viewModel.getState().loadLogs();

      // Check loading state
      expect(viewModel.getState().loading).toBe(true);
      expect(viewModel.getState().error).toBe(null);

      // Resolve the promise
      resolvePromise!(ResultUtils.ok({ logs: [], pagination: {} }));
      await loadPromise;

      expect(viewModel.getState().loading).toBe(false);
    });
  });

  describe("createUserLog", () => {
    it("should create user log successfully", async () => {
      vi.mocked(mockCreateUserLogUseCase.execute).mockResolvedValue(
        ResultUtils.ok(undefined)
      );

      // Mock refreshLogs
      vi.mocked(mockGetTaskLogsUseCase.execute).mockResolvedValue(
        ResultUtils.ok({ logs: [], pagination: {} } as any)
      );

      const result = await viewModel.getState().createUserLog({
        message: "Test log",
      });

      expect(result).toBe(true);
      expect(viewModel.getState().error).toBe(null);
      expect(mockCreateUserLogUseCase.execute).toHaveBeenCalledWith({
        message: "Test log",
      });
    });

    it("should handle create user log error", async () => {
      const errorMessage = "Failed to create log";
      vi.mocked(mockCreateUserLogUseCase.execute).mockResolvedValue(
        ResultUtils.error({ message: errorMessage } as any)
      );

      const result = await viewModel.getState().createUserLog({
        message: "Test log",
      });

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe(errorMessage);
    });
  });

  describe("Pagination", () => {
    beforeEach(() => {
      // Mock successful response for pagination tests
      vi.mocked(mockGetTaskLogsUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          logs: [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalCount: 50,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: false,
          },
        } as any)
      );
    });

    it("should load next page", async () => {
      await viewModel.getState().loadLogs();
      await viewModel.getState().loadNextPage();

      expect(mockGetTaskLogsUseCase.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });

    it("should load previous page", async () => {
      // Set up state with page 2
      vi.mocked(mockGetTaskLogsUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          logs: [],
          pagination: {
            page: 2,
            pageSize: 20,
            totalCount: 50,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: true,
          },
        } as any)
      );

      await viewModel.getState().loadLogs({ page: 2 });
      await viewModel.getState().loadPreviousPage();

      expect(mockGetTaskLogsUseCase.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });
  });

  describe("Filtering", () => {
    it("should set filter and reload logs", async () => {
      vi.mocked(mockGetTaskLogsUseCase.execute).mockResolvedValue(
        ResultUtils.ok({ logs: [], pagination: {} } as any)
      );

      viewModel.getState().setFilter({ logType: "USER" });

      expect(viewModel.getState().filter.logType).toBe("USER");
      expect(mockGetTaskLogsUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ logType: "USER", page: 1 })
      );
    });
  });

  describe("Computed Properties", () => {
    it("should filter logs correctly", () => {
      const mockLogs: LogEntry[] = [
        {
          id: 1,
          taskId: "task-1",
          type: "USER",
          message: "User log",
          createdAt: new Date(),
        },
        {
          id: 2,
          taskId: "task-1",
          type: "SYSTEM",
          message: "System log",
          createdAt: new Date(),
        },
        {
          id: 3,
          taskId: "task-2",
          type: "USER",
          message: "Another user log",
          createdAt: new Date(),
        },
      ];

      // Set logs directly for testing
      viewModel.setState({ logs: mockLogs });

      // Test filtering by type
      viewModel.setState({ filter: { logType: "USER" } });
      const userLogs = viewModel.getState().getFilteredLogs();
      expect(userLogs).toHaveLength(2);
      expect(userLogs.every((log) => log.type === "USER")).toBe(true);

      // Test filtering by taskId
      viewModel.setState({ filter: { taskId: "task-1" } });
      const task1Logs = viewModel.getState().getFilteredLogs();
      expect(task1Logs).toHaveLength(2);
      expect(task1Logs.every((log) => log.taskId === "task-1")).toBe(true);
    });

    it("should group logs by type", () => {
      const mockLogs: LogEntry[] = [
        {
          id: 1,
          type: "USER",
          message: "User log",
          createdAt: new Date(),
        },
        {
          id: 2,
          type: "SYSTEM",
          message: "System log",
          createdAt: new Date(),
        },
        {
          id: 3,
          type: "USER",
          message: "Another user log",
          createdAt: new Date(),
        },
      ];

      viewModel.setState({ logs: mockLogs });

      const logsByType = viewModel.getState().getLogsByType();
      expect(logsByType.USER).toHaveLength(2);
      expect(logsByType.SYSTEM).toHaveLength(1);
    });

    it("should check if has logs", () => {
      expect(viewModel.getState().hasLogs()).toBe(false);

      viewModel.setState({
        logs: [
          {
            id: 1,
            type: "USER",
            message: "Test log",
            createdAt: new Date(),
          },
        ],
      });

      expect(viewModel.getState().hasLogs()).toBe(true);
    });
  });
});
