import { PlanSummary } from '../types/project';

export function parseImplementReadyMarker(content: string): PlanSummary | null {
  const markerRegex = /\[IMPLEMENT_READY\]([\s\S]*?)\[\/IMPLEMENT_READY\]/;
  const match = content.match(markerRegex);

  if (!match) {
    if (content.includes('[IMPLEMENT_READY]')) {
      return {
        requirement: '用户需求已确认',
        technicalPlan: content,
        implementationSteps: [],
        confirmedAt: new Date().toISOString(),
      };
    }
    return null;
  }

  try {
    const jsonContent = match[1].trim();
    const parsed = JSON.parse(jsonContent);
    return {
      requirement: parsed.requirement || '用户需求已确认',
      technicalPlan: parsed.technicalPlan || parsed.plan || '',
      implementationSteps: parsed.steps || parsed.implementationSteps || [],
      confirmedAt: new Date().toISOString(),
    };
  } catch {
    return {
      requirement: '用户需求已确认',
      technicalPlan: match[1].trim(),
      implementationSteps: [],
      confirmedAt: new Date().toISOString(),
    };
  }
}
