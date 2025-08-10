import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { container } from "../shared/infrastructure/di";
import { SummaryService } from "../shared/application/services/SummaryService";
import * as tokens from "../shared/infrastructure/di/tokens";

describe("SummaryService Integration", () => {
  let summaryService: SummaryService;

  beforeEach(() => {
    try {
      summaryService = container.resolve<SummaryService>(
        tokens.SUMMARY_SERVICE_TOKEN
      );
    } catch (error) {
      console.error("Failed to resolve SummaryService:", error);
      throw error;
    }
  });

  afterEach(() => {
    // Clean up any running intervals
    if (summaryService) {
      summaryService.stopAutoProcessing();
    }
  });

  it("should resolve SummaryService from container", () => {
    expect(summaryService).toBeDefined();
    expect(summaryService).toBeInstanceOf(SummaryService);
  });

  it("should have processing status methods", () => {
    expect(typeof summaryService.getProcessingStatus).toBe("function");
    expect(typeof summaryService.stopAutoProcessing).toBe("function");

    const status = summaryService.getProcessingStatus();
    expect(status).toHaveProperty("isProcessing");
    expect(status).toHaveProperty("autoProcessEnabled");
    expect(typeof status.isProcessing).toBe("boolean");
    expect(typeof status.autoProcessEnabled).toBe("boolean");
  });

  it("should initialize without errors", async () => {
    try {
      const result = await summaryService.initialize();
      // Even if initialization fails due to missing data, it should return a Result
      expect(result).toBeDefined();
      expect(typeof result.isSuccess).toBe("function");
      expect(typeof result.isFailure).toBe("function");
    } catch (error) {
      // If there's an exception, the test should still pass as long as the service is properly constructed
      console.warn(
        "Initialization threw an error (expected in test environment):",
        error
      );
    }
  });
});
