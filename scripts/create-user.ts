// 첫 계정(네오다임 직원·조직 오너)을 만드는 스크립트 — 로그인 체계를 켜기 전에 한 번 실행한다.
//
//   npx tsx scripts/create-user.ts --email a@b.com --name "홍길동" --staff
//   npx tsx scripts/create-user.ts --email a@b.com --name "홍길동" --org <조직 slug> --owner
//   npx tsx scripts/create-user.ts --email a@b.com --name "홍길동" --org <조직 slug> --role viewer --brands <브랜드id,...>
//
// 비밀번호는 실행 중에 숨겨서 입력받는다(인자·셸 기록에 남지 않는다). NEODIO_NEW_PASSWORD 환경변수로도 줄 수 있다.
import { createInterface } from "node:readline";
import { getPromptStore } from "../src/lib/backend/database";
import { assignMember, createUser, setOwner } from "../src/lib/backend/auth/authStore";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    process.stdout.write(question);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question("", (answer) => {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = write;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const email = value("email");
  const name = value("name");
  if (!email || !name) throw new Error("--email 과 --name 이 필요합니다.");
  const password = process.env.NEODIO_NEW_PASSWORD ?? (await askHidden("비밀번호(8자 이상): "));
  const user = await createUser({ email, name, password, platformRole: flag("staff") ? "staff" : "none" });
  console.log(`계정 생성: ${user.email}${flag("staff") ? " (네오다임 직원)" : ""}`);

  const orgSlug = value("org");
  if (orgSlug) {
    const store = await getPromptStore();
    const org = (await store.listOrganizations()).find((o) => o.slug === orgSlug || o.id === orgSlug);
    if (!org) throw new Error(`조직을 찾을 수 없습니다: ${orgSlug}`);
    const owner = flag("owner");
    const brandIds = owner ? [] : (value("brands") ?? "").split(",").filter(Boolean);
    await assignMember(org.id, { email: user.email, role: owner ? "admin" : ((value("role") as "admin" | "viewer") ?? "viewer"), brandIds }, null);
    if (owner) await setOwner(org.id, user.id, null);
    console.log(`조직 ${org.name}: ${owner ? "오너" : (value("role") ?? "viewer")}로 할당`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
