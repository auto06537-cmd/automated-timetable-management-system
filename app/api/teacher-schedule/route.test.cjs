const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

function load(file, bindings, result) {
  const code = readFileSync(join(__dirname, file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
  return runInNewContext(stripTypeScriptTypes(code) + "\n" + result, bindings);
}
test("teacher schedule validates IDs and counts a shared lesson once", async () => {
  const helpers = load("../schedules/data.ts", {}, "({positiveInt, scheduleInclude, scheduleOrder})");
  let queries = 0;
  const shared = { id: 1, dayOfWeek: 1, groups: [{ classGroup: { name: "A" } }, { classGroup: { name: "B" } }] };
  const get = load("route.ts", {
    ...helpers, URL, denyUnlessAdmin: async () => null,
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    prisma: { schedule: { findMany: async (args) => {
      queries++;
      assert.equal(args.where.teacherId, 7);
      assert.equal(args.include.groups.include.classGroup, true);
      return [shared];
    } } },
  }, "GET");
  for (const query of ["", "?teacherId=", "?teacherId=abc", "?teacherId=-1", "?teacherId=1.5", "?teacherId=2147483648"]) {
    assert.equal((await get({ url: "https://example.test/" + query })).status, 400);
  }
  assert.equal(queries, 0);
  const response = await get({ url: "https://example.test/?teacherId=7" });
  assert.equal(response.body.total, 1);
  assert.equal(response.body.summary[0].count, 1);
  assert.equal(response.body.schedules[0].groups.length, 2);
});
