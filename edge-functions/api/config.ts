import { handleConfigRequest } from '../../src/pages/api/config';
import type { EdgeOneContext } from '../types';

export function onRequestGet(context: EdgeOneContext): Promise<Response> {
  return handleConfigRequest(context.request, context.env);
}
