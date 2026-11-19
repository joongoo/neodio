#!/usr/bin/env node

import { STAGE_A_PLAN } from "./config.mjs";

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function money(value) {
  return Number(value).toFixed(4);
}

function printPlan(query) {
  console.log("Neodio DataForSEO Stage A 실행 계획");
  console.log(`- 질의: ${query}`);
  console.log(`- 조건: ${STAGE_A_PLAN.languageCode} / ${STAGE_A_PLAN.locationName} / ${STAGE_A_PLAN.device}`);
  for (const task of STAGE_A_PLAN.tasks) {
    console.log(`- ${task.surface}: Standard task 1건, 최대 예상 USD ${money(task.estimatedMaxCostUsd)}`);
  }
  console.log(`- 합계: 2건, 최대 예상 USD ${money(STAGE_A_PLAN.estimatedMaxCostUsd)} / Stage A 한도 USD ${money(STAGE_A_PLAN.stageBudgetUsd)}`);
}

async function main() {
  const query = argValue("query", STAGE_A_PLAN.query).trim();
  printPlan(query);
  console.log("\n계획 확인만 수행했습니다. 실제 제출은 /dataforseo-poc 화면의 2단계 확인을 통해서만 가능합니다.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
