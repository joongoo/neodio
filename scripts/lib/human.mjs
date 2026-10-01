const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// 검색 주소로 곧장 들어가는 대신 먼저 첫 화면을 거쳐 쿠키·세션을 만든다 — 자동화로 의심받는 신호를 줄인다.
export async function warmUp(page, homeUrl, timeoutMs = 20_000) {
  await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
  await sleep(between(1_200, 3_000));
  await page.mouse.move(between(100, 600), between(100, 500), { steps: between(8, 20) }).catch(() => {});
  await sleep(between(300, 900));
}

// 결과를 사람이 훑어보듯 마우스를 움직이고 조금 내렸다 올린다.
export async function lookAround(page) {
  await page.mouse.move(between(80, 500), between(120, 600), { steps: between(10, 25) }).catch(() => {});
  await sleep(between(400, 1_100));
  await page.mouse.wheel(0, between(250, 700)).catch(() => {});
  await sleep(between(600, 1_500));
  await page.mouse.wheel(0, -between(150, 500)).catch(() => {});
  await sleep(between(300, 800));
}

export function proxyFromArgs(argValue) {
  return argValue("proxy") || process.env.NEODIO_PROXY || null;
}
