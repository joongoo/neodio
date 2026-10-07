import assert from "node:assert/strict";
import test from "node:test";
import { brandChangeSummary, diffFields, diffSnapshots, groupsEqual, promptSummary, promptUpdateDetail, type ConfigSnapshot } from "./changeLog";

test("브랜드 설정은 바뀐 필드만 기록한다", () => {
  const before = { name: "A", aliases: ["a"], markets: ["KR"], urls: [] as string[] };
  const after = { name: "A", aliases: ["a", "에이"], markets: ["KR"], urls: [] as string[] };
  const d = diffFields(before, after)!;
  assert.deepEqual(d.changed, ["aliases"]);
  assert.deepEqual(d.before, { aliases: ["a"] });
  assert.equal(brandChangeSummary(d.changed), "브랜드 설정 변경 — 별칭");
  assert.equal(diffFields(before, { ...before }), null); // 같으면 기록 안 함
});

test("프롬프트 수정 요약은 무엇이 바뀌었는지 보여준다", () => {
  const detail = promptUpdateDetail({ prompt: "a", category: "x", topic: "t" }, { prompt: "b", category: "x", topic: "u" });
  assert.equal(detail, "문구·토픽 변경");
  assert.equal(promptUpdateDetail({ prompt: "a", category: "x", topic: "t" }, { prompt: "a", category: "x", topic: "t" }), null);
  assert.match(promptSummary("update", "a".repeat(100), detail ?? ""), /…"/);
});

test("토픽 묶음 비교는 순서와 무관하다", () => {
  assert.equal(groupsEqual([{ topic: "B", prompts: ["2", "1"] }, { topic: "A", prompts: ["x"] }], [{ topic: "A", prompts: ["x"] }, { topic: "B", prompts: ["1", "2"] }]), true);
  assert.equal(groupsEqual([{ topic: "A", prompts: ["x"] }], [{ topic: "A", prompts: ["x", "y"] }]), false);
});

test("버전 비교는 추가·삭제·변경을 센다", () => {
  const p = (text: string, topic = "t", status = "active") => ({ text, category: "c", topic, status, surfaces: ["google-ai"] });
  const from: ConfigSnapshot = { prompts: [p("a"), p("b"), p("c")], topicGroups: [], brand: { name: "N" } };
  const to: ConfigSnapshot = { prompts: [p("a"), p("c", "다른토픽"), p("d")], topicGroups: [], brand: { name: "N" } };
  const d = diffSnapshots(from, to);
  assert.deepEqual(d.added.map((x) => x.text), ["d"]);
  assert.deepEqual(d.removed.map((x) => x.text), ["b"]);
  assert.deepEqual(d.changed.map((x) => x.text), ["c"]);
  assert.equal(d.brandChanged, false);
});

test("유저 역할·브랜드 변경 요약", async () => {
  const { describeMembershipChange, describeProfileChange, userLabel } = await import("./changeLog");
  assert.equal(userLabel({ name: "홍", email: "a@b.com" }), "홍(a@b.com)");
  assert.deepEqual(describeMembershipChange(null, { role: "viewer", brands: ["A"] }), { op: "create", text: "조직에 할당 — viewer, 브랜드 1개" });
  assert.deepEqual(describeMembershipChange({ role: "viewer", brands: ["A"] }, null), { op: "delete", text: "조직에서 제거" });
  assert.deepEqual(describeMembershipChange({ role: "viewer", brands: ["A", "B"] }, { role: "admin", brands: ["B", "C"] }), { op: "update", text: "역할 viewer→admin, 브랜드 +C −A" });
  assert.equal(describeMembershipChange({ role: "viewer", brands: ["A", "B"] }, { role: "viewer", brands: ["B", "A"] }), null); // 순서만 달라도 변경 아님
  assert.equal(describeProfileChange({ name: "a", status: "active" }, { name: "b", status: "disabled" }), "이름·계정 중지");
  assert.equal(describeProfileChange({ name: "a", status: "active" }, { name: "a", status: "active" }), null);
});
