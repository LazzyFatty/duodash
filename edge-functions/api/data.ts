import { handleDataRequest } from '../../src/pages/api/data';
import type { EdgeOneContext } from '../types';

export function onRequestGet(context: EdgeOneContext): Promise<Response> {
  return handleDataRequest(context.request, context.env);
}
