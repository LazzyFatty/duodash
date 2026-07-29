import type { RuntimeEnv } from '../src/utils/api-utils';

export interface EdgeOneContext {
  request: Request;
  env: RuntimeEnv;
  params: Record<string, string>;
  waitUntil(task: Promise<unknown>): void;
}
