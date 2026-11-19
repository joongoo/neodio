import assert from "node:assert/strict";
import test from "node:test";
import { DataForSeoClient, DataForSeoRequestError } from "./client";

test("missing credentials block fetch", async () => {
  let calls = 0;
  const client = new DataForSeoClient({
    login: "",
    password: "password",
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });
  await assert.rejects(client.postTasks("/test", [{ keyword: "x" }]), DataForSeoRequestError);
  assert.equal(calls, 0);
});

test("주입한 fetch로 task 1건만 제출한다", async () => {
  let body = "";
  const client = new DataForSeoClient({
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
