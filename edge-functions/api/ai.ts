import { handleAiRequest } from '../../src/pages/api/ai';
import type { EdgeOneContext } from '../types';

export function onRequestPost(context: EdgeOneContext): Promise<Response> {
  return handleAiRequest(context.request, context.env);
}
