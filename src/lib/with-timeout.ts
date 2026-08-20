export const SUPABASE_REQUEST_TIMEOUT_MS = 10_000;

export class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError(message));
    }, timeoutMs);
  });

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
    controller.abort();
  });
}
