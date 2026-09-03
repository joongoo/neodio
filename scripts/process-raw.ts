import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { processPromptRuns } from "../src/lib/backend/processing";
import { seedBrands, seedPromptRuns } from "../src/lib/db/data/seed";
import { PromptRunSeed } from "../src/lib/db/types";

const DEFAULT_INPUT_DIR = ".tmp/naver-ai";
const DEFAULT_OUTPUT_DIR = ".tmp/processed";

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function readCollectedNaverRuns(inputDir: string): Promise<PromptRunSeed[]> {
  const filenames = await readdir(inputDir).catch(() => []);
  const jsonFiles = filenames.filter((filename) => filename.endsWith(".json")).sort();
  const runs: PromptRunSeed[] = [];

  for (const filename of jsonFiles) {
    const filePath = path.join(inputDir, filename);
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as { promptRun?: PromptRunSeed };
    if (parsed.promptRun) runs.push(parsed.promptRun);
  }

  return runs;
}

async function main() {
  const inputDir = argValue("input-dir", DEFAULT_INPUT_DIR);
  const outputDir = argValue("out", DEFAULT_OUTPUT_DIR);
  const includeSeed = hasFlag("include-seed");
  const collectedRuns = await readCollectedNaverRuns(inputDir);
  const promptRuns = includeSeed ? [...seedPromptRuns, ...collectedRuns] : collectedRuns;

  const processed = processPromptRuns({
    organizationId: "neodigm",
    ownBrandId: "brand-neodigm",
    promptRuns,
    brands: seedBrands,
  });

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `processed-runs-${new Date().toISOString().replaceAll(":", "-")}.json`);
  await writeFile(outputPath, `${JSON.stringify(processed, null, 2)}\n`, "utf8");

  const ownMentions = processed.mentions.filter((mention) => mention.brandId === "brand-neodigm" && mention.isPresent);
  const ownCitations = processed.citations.filter((citation) => citation.isOwnDomain);

  console.log(
    JSON.stringify(
      {
        outputPath,
        promptRuns: processed.promptRuns.length,
        mentions: processed.mentions.length,
        ownMentions: ownMentions.length,
        citations: processed.citations.length,
        ownCitations: ownCitations.length,
        visibilityScores: processed.visibilityScores.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
