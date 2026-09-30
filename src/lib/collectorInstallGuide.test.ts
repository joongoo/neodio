import assert from "node:assert/strict";
import test from "node:test";
import { GUIDE_OS_PLATFORMS, initialGuideOs } from "./collectorInstallGuide";

test("the detected installer type decides the first OS tab", () => {
  assert.equal(initialGuideOs("win-x64", ""), "windows");
  assert.equal(initialGuideOs("mac-arm64", "Windows"), "mac");
  assert.equal(initialGuideOs("mac-x64", ""), "mac");
});

test("without detection the browser info decides, and unknown systems fall back to macOS", () => {
  assert.equal(initialGuideOs(null, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140"), "windows");
  assert.equal(initialGuideOs(undefined, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "mac");
  assert.equal(initialGuideOs(null, "Mozilla/5.0 (X11; Linux x86_64)"), "mac");
});

test("every OS has the installer files it needs", () => {
  assert.deepEqual(GUIDE_OS_PLATFORMS.mac, ["mac-arm64", "mac-x64"]);
  assert.deepEqual(GUIDE_OS_PLATFORMS.windows, ["win-x64"]);
});
