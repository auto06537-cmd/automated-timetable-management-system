const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { dirname, join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

function loader(prisma, scheduler = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    const source = readFileSync(file, "utf8")
      .replace(/import \{([^}]+)\} from "([^"]+)";/g, "const {$1} = use('$2');")
      .replace(/export (async function|function|const) (\w+)/g, (_, type, name) => {
        return type === "const" ? `const ${name} = exports.${name}` : `exports.${name} = ${type} ${name}`;
      });
    const use = (name) => {
      if (name === "next/server") return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
      if (name === "@/lib/auth") return { denyUnlessAdmin: async () => null };
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/scheduler") return scheduler;
      return load(join(dirname(file), name + ".ts"));
    };
    runInNewContext(stripTypeScriptTypes(source), { exports, use, console });
    cache.set(file, exports);
    return exports;
  }
  return (path) => load(join(__dirname, "..", path, "route.ts"));
}

const req = (body) => ({ json: async () => body, text: async () => JSON.stringify(body) ?? "" });
const query = (group) => ({ nextUrl: new URL(`https://test.invalid/?classGroupId=${group}`) });
const params = { params: { id: "7" } };

test("subject POST and PUT validate paired mode and preserve an omitted value", async () => {
  const db = {
    subject: {
      create: async ({ data }) => data,
      findUnique: async () => ({ isCommon: true, pairedMode: "SHARED_ROOM" }),
      update: async ({ data }) => data,
    },
    $transaction: (callback) => callback(db),
  };
  const api = loader(db);
  const base = { code: "S", name: "Common", periodsPerWeek: "2" };
  assert.equal((await api("subjects").POST(req({ ...base, pairedMode: "SHARED_ROOM" }))).status, 400);
  assert.equal((await api("subjects").POST(req({ ...base, isCommon: true, pairedMode: "SEPARATE_ROOMS" }))).body.pairedMode, "SEPARATE_ROOMS");
  assert.equal((await api("subjects/[id]").PUT(req({ ...base, pairedMode: "wrong" }), params)).status, 400);
  assert.equal((await api("subjects/[id]").PUT(req(base), params)).body.pairedMode, "SHARED_ROOM");
});

test("both groups read the same schedule ID exactly once and GET performs no writes", async () => {
  const row = { id: 7, classGroupId: 1, groups: [{ classGroupId: 1 }, { classGroupId: 2 }] };
  const api = loader({ schedule: {
    findMany: async ({ where, include }) => {
      assert.equal(include.groups.include.classGroup, true);
      return [row].filter((item) => where.OR.some((clause) =>
        clause.classGroupId === item.classGroupId ||
        item.groups.some((group) => group.classGroupId === clause.groups?.some.classGroupId)));
    },
  } })("schedules");
  for (const id of [1, 2]) {
    const response = await api.GET(query(id));
    assert.deepEqual(response.body, [row]);
  }
  assert.equal((await api.GET(query("0"))).status, 400);
});

test("a move checks all linked groups and updates only the parent schedule", async () => {
  let blocked = true;
  let updates = 0;
  const db = {
    $transaction: (callback) => callback(db),
    schedule: {
      findUnique: async () => ({ id: 7, classGroupId: 1, groups: [{ classGroupId: 2 }], teacherId: null }),
      findFirst: async ({ where }) => {
        assert.equal(where.OR[2].groups.some.classGroupId.in.join(","), "1,2");
        return blocked ? { id: 8 } : null;
      },
      update: async ({ data }) => { updates++; return data; },
    },
    period: { findUnique: async () => ({ periodNo: 1, isLunch: false }) },
    room: { findUnique: async () => ({ id: 1 }) },
    lockedSlot: { findFirst: async () => null },
    classGroup: { findFirst: async () => null },
  };
  const api = loader(db)("schedules/[id]");
  const body = { dayOfWeek: 2, periodId: 1, roomId: 1 };
  assert.equal((await api.PUT(req({ ...body, groups: [] }), params)).status, 400);
  assert.equal((await api.PUT(req(body), params)).status, 409);
  assert.equal(updates, 0);
  blocked = false;
  assert.equal((await api.PUT(req(body), params)).status, 200);
  assert.equal(updates, 1);
});

test("generate-all rejects malformed or unplaceable plans and saves one paired plan", async () => {
  const rows = [1, 2].map((id) => ({ id, year: 1, name: String(id), pairKey: "A" }));
  const shared = { classGroupId: 1, sharedGroupId: 2 };
  const plan = Object.assign(new Map([[1, [shared]], [2, [shared]]]), { unplaced: [] });
  let saves = 0;
  const api = loader({ classGroup: { findMany: async () => rows } }, {
    generateSchedulePaired: async (pairs) => { assert.equal(pairs.flat().join(","), "1,2"); return plan; },
    saveAllSchedules: async (value) => { assert.equal(value, plan); saves++; },
  })("generate-all");
  assert.equal((await api.POST(req({ usePairing: "false" }))).status, 400);
  plan.unplaced.push({ groupIds: [1, 2], reason: "no room" });
  const failed = await api.POST(req({ year: 1 }));
  assert.equal(failed.status, 422);
  assert.equal(failed.body.status, "failure");
  assert.equal(failed.body.ok, false);
  assert.equal(failed.body.failureCount, 2);
  assert.equal(saves, 0);
  plan.unplaced.length = 0;
  const success = await api.POST(req({ year: 1 }));
  assert.equal(success.status, 200);
  assert.equal(success.body.status, "success");
  assert.equal(success.body.ok, true);
  assert.equal(saves, 1);
});

test("single-group generation returns schedules through the membership filter", async () => {
  const plan = Object.assign([], { unplaced: [{ reason: "busy" }] });
  let saves = 0;
  const api = loader({
    classGroup: { findUnique: async () => ({ id: 2 }) },
    schedule: { findMany: async ({ where }) => {
      assert.equal(where.OR[1].groups.some.classGroupId, 2);
      return [{ id: 7, classGroupId: 1 }];
    } },
  }, {
    generateSchedule: async () => plan,
    saveSchedule: async () => { saves++; },
  })("generate");
  assert.equal((await api.POST(req({ classGroupId: true }))).status, 400);
  assert.equal((await api.POST(req({ classGroupId: "2" }))).status, 422);
  assert.equal(saves, 0);
  plan.unplaced.length = 0;
  assert.equal((await api.POST(req({ classGroupId: 2 }))).body.schedules[0].id, 7);
  assert.equal(saves, 1);
});

test("bulk delete protects shared rows while explicit deletion targets one parent", async () => {
  const deleted = [];
  const db = {
    $transaction: (callback) => callback(db),
    schedule: {
      findFirst: async () => ({ id: 7 }),
      findUnique: async () => ({ id: 7, isLocked: false }),
      deleteMany: async () => { deleted.push("bulk"); },
      delete: async ({ where }) => { deleted.push(where.id); },
    },
  };
  const api = loader(db);
  assert.equal((await api("schedules").DELETE(query(2))).status, 409);
  assert.deepEqual(deleted, []);
  assert.equal((await api("schedules/[id]").DELETE(null, params)).status, 200);
  assert.deepEqual(deleted, [7]);
});

test("class group, room, and teacher PUT return 404 for missing IDs and update existing IDs", async () => {
  const resources = [
    { path: "classgroups/[id]", model: "classGroup", body: { name: "A", year: 2 }, updated: { id: 7, name: "A" } },
    { path: "rooms/[id]", model: "room", body: { name: "Room A", capacity: 30 }, updated: { id: 7, name: "Room A" } },
    { path: "teachers/[id]", model: "teacher", body: { code: "T7", name: "Teacher", maxPeriodsPerDay: 5 }, updated: { id: 7, name: "Teacher" } },
  ];

  for (const resource of resources) {
    let exists = false;
    const prisma = {
      [resource.model]: {
        update: async ({ where }) => {
          assert.equal(where.id, 7);
          if (!exists) throw Object.assign(new Error("internal Prisma details"), { code: "P2025" });
          return resource.updated;
        },
      },
      teacherSubject: { deleteMany: async () => {}, createMany: async () => {} },
    };
    const put = loader(prisma)(resource.path).PUT;

    const missing = await put(req(resource.body), params);
    assert.equal(missing.status, 404, `${resource.path} missing ID`);
    assert.doesNotMatch(JSON.stringify(missing.body), /P2025|internal Prisma details/);

    exists = true;
    const updated = await put(req(resource.body), params);
    assert.equal(updated.status, 200, `${resource.path} existing ID`);
    assert.deepEqual(updated.body, resource.updated);
  }
});

test("resource PUT handlers rethrow errors other than Prisma P2025", async () => {
  const unexpected = Object.assign(new Error("database unavailable"), { code: "P1001" });
  for (const [path, model] of [["classgroups/[id]", "classGroup"], ["rooms/[id]", "room"], ["teachers/[id]", "teacher"]]) {
    const api = loader({ [model]: { update: async () => { throw unexpected; } } })(path);
    await assert.rejects(() => api.PUT(req({}), params), (error) => error === unexpected);
  }
});

test("class group DELETE rejects shared memberships and rolls back failed deletes", async () => {
  async function runDelete({ shared = false, failAtGroupDelete = false } = {}) {
    const state = {
      groups: [{ id: 7 }],
      schedules: [{ id: 8, classGroupId: 7 }],
      lockedSlots: [{ id: 9, classGroupId: 7 }],
    };
    const tx = {
      classGroup: {
        findUnique: async () => state.groups[0] ?? null,
        delete: async ({ where }) => {
          if (failAtGroupDelete) throw Object.assign(new Error("foreign key"), { code: "P2003" });
          state.groups = state.groups.filter((group) => group.id !== where.id);
        },
      },
      schedule: {
        findFirst: async ({ where }) => {
          assert.equal(where.OR.length, 2);
          return shared ? { id: 8 } : null;
        },
        deleteMany: async ({ where }) => {
          state.schedules = state.schedules.filter((schedule) => schedule.classGroupId !== where.classGroupId);
        },
      },
      lockedSlot: {
        deleteMany: async ({ where }) => {
          state.lockedSlots = state.lockedSlots.filter((slot) => slot.classGroupId !== where.classGroupId);
        },
      },
    };
    const db = {
      $transaction: async (callback) => {
        const original = structuredClone(state);
        try {
          const response = await callback(tx);
          Object.assign(state, structuredClone(state));
          return response;
        } catch (error) {
          Object.assign(state, original);
          throw error;
        }
      },
    };
    const response = await loader(db)("classgroups/[id]").DELETE(null, params);
    return { response, state };
  }

  const shared = await runDelete({ shared: true });
  assert.equal(shared.response.status, 409);
  assert.deepEqual(shared.state.schedules, [{ id: 8, classGroupId: 7 }]);
  assert.deepEqual(shared.state.lockedSlots, [{ id: 9, classGroupId: 7 }]);
  assert.deepEqual(shared.state.groups, [{ id: 7 }]);

  const failed = await runDelete({ failAtGroupDelete: true });
  assert.equal(failed.response.status, 409);
  assert.deepEqual(failed.state.schedules, [{ id: 8, classGroupId: 7 }]);
  assert.deepEqual(failed.state.lockedSlots, [{ id: 9, classGroupId: 7 }]);
  assert.deepEqual(failed.state.groups, [{ id: 7 }]);

  const ordinary = await runDelete();
  assert.equal(ordinary.response.status, 200);
  assert.deepEqual(ordinary.state.schedules, []);
  assert.deepEqual(ordinary.state.lockedSlots, []);
  assert.deepEqual(ordinary.state.groups, []);
});
