export interface IApiError extends Error {
  statusCode: number;
  errors: any[];
  success: boolean;
}

export function createApiError(
  statusCode: number,
  message: string = "Something went wrong",
  errors: any[] = [],
  stack: string = ""
): IApiError {
  const error = new Error(message) as IApiError;
  error.statusCode = statusCode;
  error.errors = errors;
  error.success = false;

  if (stack) {
    error.stack = stack;
  } else {
    Error.captureStackTrace(error, createApiError);
  }

  return error;
}

export function isApiError(err: any): err is IApiError {
  return err instanceof Error && "statusCode" in err && "success" in err;
}
