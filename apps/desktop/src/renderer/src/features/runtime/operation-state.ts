import type {
  DesktopApiError,
  DesktopResult
} from '../../../../shared/enterprise-brain.js';

export function resolveOperation<T>(result: DesktopResult<T>): {
  data?: T;
  error?: DesktopApiError;
} {
  return result.ok
    ? { data: result.data, error: undefined }
    : { error: result.error };
}
