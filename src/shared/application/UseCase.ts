import { Result } from "../domain/Result";

/**
 * Base interface for all use cases
 */
export interface UseCase<TRequest, TResponse> {
  execute(request: TRequest): Promise<Result<TResponse, Error>>;
}
