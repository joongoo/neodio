// Isolated browser regression: no app server, authentication, DB or provider API.
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    contents: `import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {RequestDetailFilters} from './src/components/collection-runs/RequestDetailFilters';
      function App(){const [query,setQuery]=useState('');const [loading,setLoading]=useState(false);return <>
        <RequestDetailFilters query={query} loading={loading} onChange={changes=>{setLoading(true);setTimeout(()=>setLoading(false),80);setQuery(previous=>{
          const p=new URLSearchParams(previous);Object.entries(changes).forEach(([k,v])=>v?p.set(k,v):p.delete(k));return p.toString();
        })}}/><button id="outside">outside</button></>}
      createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
  define: { "process.env.NODE_ENV": '"development"' },
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("crash", () => errors.push("CRASH"));
  await page.setContent('<div id="root"></div>');
  // Next's imported modules expect this shim outside its app runtime.
  await page.addScriptTag({ content: "window.process={env:{}};" });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForSelector('#root > div[aria-label]', { timeout: 5000 });
  await page.addStyleTag({ content: "[hidden]{display:none!important} .relative{position:relative}.absolute{position:absolute;top:100%;left:0;z-index:30;background:white;min-width:224px} #root>div[aria-label]{display:flex;gap:12px} #root>div[aria-label]>div{display:flex;flex-direction:column} [role=checkbox]{display:flex;width:100%;padding:6px}" });
  const triggers = page.locator('#root > div[aria-label] > div > button');
  for (let i = 0; i < 20; i++) {
    await triggers.nth(0).click();
    const status = page.getByRole('checkbox').first();
    const bounds = await status.boundingBox();
    await status.click({ position: { x: bounds.width - 5, y: bounds.height / 2 } });
    if (await triggers.nth(0).getAttribute("aria-expanded") !== "true") throw Error("Status closed after row click");
    await page.waitForFunction(() => document.querySelector('[role=checkbox]').getAttribute('aria-disabled') === 'false');
    await page.getByRole('checkbox').nth(1).click();
    if (await triggers.nth(0).getAttribute("aria-expanded") !== "true") throw Error("Status closed after second selection");
    await triggers.nth(1).click();
    if (await triggers.nth(0).getAttribute("aria-expanded") !== "false") throw Error("Status stayed open");
    await page.getByRole('checkbox').first().click();
    if (await triggers.nth(1).getAttribute("aria-expanded") !== "true") throw Error("Platform closed after selection");
    await page.locator("#outside").click();
    if (await triggers.nth(1).getAttribute("aria-expanded") !== "false") throw Error("Platform stayed open");
  }
  await triggers.nth(0).click();
  await page.keyboard.press("Escape");
  if (await triggers.nth(0).getAttribute("aria-expanded") !== "false") throw Error("Escape failed");
  await triggers.nth(0).click();
  await page.locator('#root > div[aria-label] > div').nth(2).getByRole("button").first().click();
  if (await triggers.nth(0).getAttribute("aria-expanded") !== "false") throw Error("Sort did not close status");
  if (errors.length) throw Error(errors.join("\n"));
  console.log("PASS: Chromium 20 filter rounds, exclusive dropdowns, outside click, Escape, sort focus; zero page errors");
} finally {
  await browser.close();
}
