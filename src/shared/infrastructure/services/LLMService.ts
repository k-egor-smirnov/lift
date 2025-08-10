import { injectable, inject } from "tsyringe";
import { LLMSettings } from "../../domain/types/LLMSettings";
import { Result, ResultUtils } from "../../domain/Result";

/**
 * Request for LLM summarization
 */
export interface LLMSummarizationRequest {
  content: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Response from LLM summarization
 */
export interface LLMSummarizationResponse {
  summary: string;
  tokensUsed?: number;
}

/**
 * Error for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Service for interacting with LLM APIs (OpenAI-compatible)
 */
@injectable()
export class LLMService {
  private static readonly DEFAULT_SYSTEM_PROMPT = `Ты — ассистент, который анализирует данные из TODO-приложения за указанный промежуток времени.
У тебя есть три типа записей:

Задачи — их названия, статусы (новая, в процессе, выполнена), дата создания и выполнения.

Логи по задачам — события и комментарии, привязанные к конкретным задачам (например, уточнения, промежуточные результаты, трудности).

Непривязанные логи — заметки или действия, которые не относятся к конкретным задачам, но отражают работу или события.

Твоя цель — суммировать прогресс за указанный промежуток, чтобы можно было быстро понять, что было сделано, какие задачи завершены, какие продвинулись, и что происходило вне задач.

При суммаризации:

Сначала дай краткий обзор прогресса (1–3 предложения).

Затем структурируй информацию в три блока:

Выполненные задачи (с кратким описанием результата).

Продвинутые, но не завершённые задачи (что было сделано, что осталось).

Важные события вне задач (из непривязанных логов).

Если есть проблемы, блокеры или повторяющиеся трудности, упомяни их в отдельном подпункте.

Используй ясный, нейтральный стиль.

Не упускай мелкие, но показательные действия, если они отражают реальный прогресс.

Входные данные будут в формате:

css
Копировать
Редактировать
[тип: задача | лог-задачи | лог-вне-задач] — [дата/время] — [текст]
Отвечай только итоговой структурированной сводкой, без лишних комментариев.`;

  /**
   * Summarize logs using LLM
   */
  async summarizeLogs(
    request: LLMSummarizationRequest,
    settings: LLMSettings
  ): Promise<Result<LLMSummarizationResponse, LLMError>> {
    if (!settings.enabled) {
      return ResultUtils.error(
        new LLMError("LLM is not enabled", "LLM_DISABLED")
      );
    }

    if (!settings.apiKey.trim()) {
      return ResultUtils.error(
        new LLMError("API key is required", "MISSING_API_KEY")
      );
    }

    if (!settings.apiUrl.trim()) {
      return ResultUtils.error(
        new LLMError("API URL is required", "MISSING_API_URL")
      );
    }

    try {
      const response = await fetch(`${settings.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            {
              role: "system",
              content: LLMService.DEFAULT_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: request.content,
            },
          ],
          max_tokens: request.maxTokens || settings.maxTokens,
          temperature: request.temperature ?? settings.temperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          // Keep the default error message
        }

        return ResultUtils.error(
          new LLMError(
            `API request failed: ${errorMessage}`,
            "API_ERROR",
            response.status
          )
        );
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return ResultUtils.error(
          new LLMError("No response from LLM", "NO_RESPONSE")
        );
      }

      const summary = data.choices[0].message?.content?.trim();
      if (!summary) {
        return ResultUtils.error(
          new LLMError("Empty response from LLM", "EMPTY_RESPONSE")
        );
      }

      return ResultUtils.ok({
        summary,
        tokensUsed: data.usage?.total_tokens,
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return ResultUtils.error(
          new LLMError(
            "Network error: Unable to connect to LLM API",
            "NETWORK_ERROR"
          )
        );
      }

      return ResultUtils.error(
        new LLMError(
          `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
          "UNKNOWN_ERROR"
        )
      );
    }
  }

  /**
   * Test connection to LLM API
   */
  async testConnection(
    settings: LLMSettings
  ): Promise<Result<boolean, LLMError>> {
    if (!settings.enabled) {
      return ResultUtils.error(
        new LLMError("LLM is not enabled", "LLM_DISABLED")
      );
    }

    const testRequest: LLMSummarizationRequest = {
      content: "Test connection",
      maxTokens: 10,
      temperature: 0,
    };

    const result = await this.summarizeLogs(testRequest, settings);

    if (ResultUtils.isSuccess(result)) {
      return ResultUtils.ok(true);
    }

    return ResultUtils.error(result.error);
  }
}
