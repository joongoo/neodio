/** WScript reads UTF-16 with a BOM; ANSI/UTF-8 corrupts Korean user paths. */
export function windowsStartupVbs(nodePath: string, agentPath: string): Buffer {
  const command = `"${nodePath}" "${agentPath}" run`;
  const source = [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run "${command.replace(/"/g, '""')}", 0, False`,
    "",
  ].join("\r\n");
  return Buffer.from(`\uFEFF${source}`, "utf16le");
}
