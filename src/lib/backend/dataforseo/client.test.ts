import assert from "node:assert/strict";
import test from "node:test";
import { DataForSeoClient, DataForSeoDisabledError } from "./client";

test("운영 플래그가 꺼져 있으면 fetch를 호출하기 전에 차단한다", async () => {
  let calls = 0;
  const client = new DataForSeoClient({
    enabled: false,
    login: "login",
    password: "password",
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });
  await assert.rejects(client.postTasks("/test", [{ keyword: "x" }]), DataForSeoDisabledError);
  assert.equal(calls, 0);
});

test("주입한 fetch로 task 1건만 제출한다", async () => {
  let body = "";
  const client = new DataForSeoClient({
    enabled: true,
    login: "login",
    password: "password",
    fetchImpl: async (_input, init) => {
      body = String(init?.body ?? "");
      return Response.json({ status_code: 20000, tasks: [{ id: "task-1", status_code: 20100 }] });
    },
  });
  const result = await client.postTasks("/test", [{ keyword: "x" }]);
  assert.equal(result.tasks?.[0].id, "task-1");
  assert.deepEqual(JSON.parse(body), [{ keyword: "x" }]);
  assert.throws(() => client.postTasks("/test", [{ keyword: "x" }, { keyword: "y" }]), /task 1건/);
});
