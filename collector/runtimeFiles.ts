import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

/** fs.cpSync can crash the Windows runtime when the destination contains Korean. */
export function copyWindowsRuntime(source: string, destination: string) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyWindowsRuntime(from, to);
    else copyFileSync(from, to);
  }
}
