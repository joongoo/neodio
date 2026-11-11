export const STAGE_A_PLAN = Object.freeze({
  stage: "A",
  query: "생성형 AI란 무엇이며 기업에서 어떻게 활용할 수 있나요?",
  locationName: "South Korea",
  languageCode: "ko",
  device: "desktop",
  tasks: Object.freeze([
    Object.freeze({
      surface: "google_aio",
      postPath: "/v3/serp/google/organic/task_post",
      getPath: "/v3/serp/google/organic/task_get/advanced",
      estimatedMaxCostUsd: 0.0012,
      options: Object.freeze({ load_async_ai_overview: true }),
    }),
    Object.freeze({
      surface: "google_ai_mode",
      postPath: "/v3/serp/google/ai_mode/task_post",
      getPath: "/v3/serp/google/ai_mode/task_get/advanced",
      estimatedMaxCostUsd: 0.0012,
      options: Object.freeze({}),
    }),
  ]),
  estimatedMaxCostUsd: 0.0024,
  stageBudgetUsd: 1,
});

export function buildTaskPayload(task, runId, query = STAGE_A_PLAN.query) {
  return {
    keyword: query,
    location_name: STAGE_A_PLAN.locationName,
    language_code: STAGE_A_PLAN.languageCode,
    device: STAGE_A_PLAN.device,
    priority: 1,
    tag: `neodio-stage-a:${runId}:${task.surface}`,
    ...task.options,
  };
}
