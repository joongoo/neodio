import { PromptLibraryClient } from "@/components/prompt-library/PromptLibraryClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function PromptLibraryPage() {
  const [rows, health] = await Promise.all([
    db.promptLibrary.list(DEFAULT_ORG_ID),
    db.promptLibrary.getHealth(DEFAULT_ORG_ID),
  ]);

  return <PromptLibraryClient initialRows={rows} health={health} />;
}
