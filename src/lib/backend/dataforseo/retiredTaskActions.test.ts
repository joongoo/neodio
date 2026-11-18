import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";

test("retired submit/delete endpoints enforce write permissions and never load execution or DB code", async () => {
  const realRequire = createRequire(import.meta.url);
  for (const [path, method] of [["submit/route.ts", "POST"], ["[id]/route.ts", "DELETE"]]) {
    const bundled = await build({ entryPoints: [`src/app/api/dataforseo/tasks/${path}`], bundle: true, write: false,
      platform: "node", format: "cjs", packages: "external", plugins: [{ name: "auth-stub", setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/backend\/auth\/guard$/ }, args => ({ path: args.path, external: true }));
      } }] });
    let denied: Response | null = null;
    let checked = 0;
    const compiled = { exports: {} as Record<string, () => Promise<Response>> };
    const controlledRequire = (name: string) => {
      if (name === "@/lib/backend/auth/guard") return { guardApi: async (permission: string) => { assert.equal(permission, "write"); checked++; return denied; } };
      assert.equal(name, "next/server", "retired routes cannot load provider, store or wake modules");
      return realRequire(name);
    };
    new Function("require", "module", "exports", bundled.outputFiles[0].text)(controlledRequire, compiled, compiled.exports);
    const response = await compiled.exports[method]();
    assert.equal(response.status, 410);
    assert.equal((await response.json()).code, "request_detail_required");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    denied = new Response(null, { status: 403 });
    assert.equal(await compiled.exports[method](), denied);
    assert.equal(checked, 2);
  }
});
