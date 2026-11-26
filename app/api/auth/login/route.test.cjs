const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { resolve, join, relative } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const root = resolve(__dirname, "../../../..");
const origin = "https://timetable.example";
const password = crypto.randomBytes(20).toString("hex");
const storedHash = "mock-stored-password-hash";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cookieName = "admin_session";

function load(file, bindings) {
  const code = readFileSync(join(root, file), "utf8").replace(/^import .*$/gm, "");
  const names = [...code.matchAll(/^export (?:async )?function (\w+)/gm)].map((item) => item[1]);
  return runInNewContext(stripTypeScriptTypes(code.replace(/^export /gm, "")) +
    `\n;({${names.join(",")}})`, bindings);
}

function fixture(t, options = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  function migrate(name) {
    db.exec(readFileSync(join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  migrate("0000_baseline");
  migrate("0001_paired_schedule_groups");
  db.prepare("INSERT INTO Admin (id, username, password) VALUES (1, ?, ?)").run("admin", storedHash);
  const before = db.prepare("SELECT * FROM Admin").all();
  migrate("0002_admin_session");

  const comparisons = [];
  const rows = () => db.prepare("SELECT * FROM AdminSession").all();
  const prisma = {
    admin: {
      findUnique: async ({ where, select }) => {
        assert.equal(select.id, true);
        assert.equal(select.password, true);
        if (options.unavailable) throw new Error("private database details");
        return db.prepare("SELECT id, password FROM Admin WHERE username = ?").get(where.username);
      },
    },
    adminSession: {
      create: async ({ data }) => db.prepare(
        "INSERT INTO AdminSession (tokenHash, adminId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
      ).run(data.tokenHash, data.adminId, data.createdAt.toISOString(), data.expiresAt.toISOString()),
      deleteMany: async ({ where }) => db.prepare(
        "DELETE FROM AdminSession WHERE tokenHash = ?",
      ).run(where.tokenHash),
      findUnique: async ({ where }) => {
        const row = db.prepare("SELECT adminId, expiresAt FROM AdminSession WHERE tokenHash = ?").get(where.tokenHash);
        return row ? { ...row, expiresAt: new Date(row.expiresAt) } : null;
      },
    },
    async $transaction(callback) {
      db.exec("BEGIN");
      try {
        const result = await callback(prisma);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const bindings = {
    URL, Buffer, prisma, Date, process: { env: { APP_ORIGIN: options.configuredOrigin ?? origin } },
    createHash: crypto.createHash, randomBytes: crypto.randomBytes,
    NextResponse: { json(body, init) {
      const cookies = new Map();
      return {
        body: JSON.parse(JSON.stringify(body)), ...init, cookieValues: cookies,
        cookies: { set: (name, value, attributes) => cookies.set(name, { ...attributes, value }) },
      };
    } },
    bcrypt: { compare: async (value, hash) => {
      comparisons.push({ value, hash });
      return value === password && hash === storedHash;
    } },
  };
  const auth = load("lib/auth.ts", bindings);
  const retiredFingerprint = readFileSync(join(root, "app/api/auth/login/route.ts"), "utf8")
    .match(/const retiredPassword = "([a-f0-9]+)"/)[1];
  const loginBindings = options.retired ? {
    ...bindings, createHash: () => ({ update() { return this; }, digest: () => retiredFingerprint }),
  } : bindings;
  const login = load("app/api/auth/login/route.ts", { ...loginBindings, ...auth }).POST;
  const logout = load("app/api/auth/logout/route.ts", { ...bindings, ...auth }).POST;
  const req = (body, options = {}) => ({
    method: options.method ?? "POST",
    json: async () => {
      if (options.malformed) throw new SyntaxError("invalid JSON");
      return body;
    },
    cookies: { get: (name) => name === cookieName && options.token ? { value: options.token } : undefined },
    headers: new Headers({ Origin: options.origin === undefined ? origin : options.origin }),
  });
  return { db, before, rows, login, logout, req, ...auth, comparisons };
}

const credentials = { username: "admin", password };
const cookie = (response) => response.cookieValues.get(cookieName);
const signIn = (f, options) => f.login(f.req(credentials, options));

test("migration preserves existing Admin, creates indexed sessions and enforces the Admin foreign key", (t) => {
  const { db, before, rows } = fixture(t);
  assert.deepEqual(db.prepare("SELECT * FROM Admin").all(), before);
  assert.deepEqual(rows(), []);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const indexes = db.prepare("PRAGMA index_list('AdminSession')").all().map((row) => row.name);
  assert.equal(indexes.includes("AdminSession_adminId_idx"), true);
  assert.equal(indexes.includes("AdminSession_expiresAt_idx"), true);
  assert.throws(() => db.exec("INSERT INTO AdminSession (tokenHash, adminId, expiresAt) VALUES ('test', 99, CURRENT_TIMESTAMP)"), /FOREIGN KEY/);
});

test("verified login sets an eight-hour secure cookie and stores only the hash", async (t) => {
  const f = fixture(t);
  const response = await signIn(f);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(f.comparisons, [{ value: password, hash: storedHash }]);
  const sessionCookie = cookie(response);
  assert.match(sessionCookie.value, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.sameSite, "lax");
  assert.equal(sessionCookie.secure, true);
  const [row] = f.rows();
  assert.equal(row.adminId, 1);
  assert.equal(row.tokenHash, sha256(sessionCookie.value));
  assert.equal(Date.parse(row.expiresAt) - Date.parse(row.createdAt), 8 * 60 * 60 * 1000);
  assert.equal(+sessionCookie.expires, Date.parse(row.expiresAt));
  assert.ok(!JSON.stringify(row).includes(sessionCookie.value));
});

test("reads a valid session and rejects forged, malformed and expired tokens", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  assert.equal((await f.readAdminSession(f.req(null, { token }))).adminId, 1);
  for (const invalid of ["invalid", crypto.randomBytes(32).toString("base64url")]) {
    assert.equal(await f.readAdminSession(f.req(null, { token: invalid })), null);
  }
  f.db.prepare("UPDATE AdminSession SET expiresAt = ?").run(new Date(0).toISOString());
  assert.equal(await f.readAdminSession(f.req(null, { token })), null);
});

test("successful re-login rotates the token and revokes the previous one", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  const next = cookie(await signIn(f, { token })).value;
  assert.notEqual(next, token);
  assert.equal(f.rows().length, 1);
  assert.equal(await f.readAdminSession(f.req(null, { token })), null);
  assert.equal((await f.readAdminSession(f.req(null, { token: next }))).adminId, 1);
});

test("logout removes the server session and expires the cookie", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  const response = await f.logout(f.req(null, { token }));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.equal(cookie(response).value, "");
  assert.equal(+cookie(response).expires, 0);
  assert.equal(f.rows().length, 0);
  assert.equal(await f.readAdminSession(f.req(null, { token })), null);
});

test("foreign or missing Origin cannot create or revoke a session", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  for (const invalid of ["https://other.example", ""]) {
    assert.equal((await signIn(f, { origin: invalid, token })).status, 403);
    assert.equal((await f.logout(f.req(null, { origin: invalid, token }))).status, 403);
  }
  assert.equal(f.rows().length, 1);
  assert.equal((await f.readAdminSession(f.req(null, { token }))).adminId, 1);
});

test("wrong password and unknown username return the same 401 without changing sessions", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  const wrong = await f.login(f.req({ username: "admin", password: "incorrect" }, { token }));
  const unknown = await f.login(f.req({ username: "unknown", password }));
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(cookie(wrong), undefined);
  assert.equal(cookie(unknown), undefined);
  assert.equal(f.comparisons.length, 3);
  assert.match(f.comparisons[2].hash, /^\$2b\$10\$[./A-Za-z0-9]{53}$/);
  assert.equal(f.rows().length, 1);
  assert.equal((await f.readAdminSession(f.req(null, { token }))).adminId, 1);
});

test("invalid inputs, a retired password and a database error do not set cookies", async (t) => {
  const f = fixture(t);
  for (const data of [null, [], {}, { username: "admin" }, { username: "admin", password: 1 },
    { username: "admin", password: "ก".repeat(25) }, { username: "admin", password: "a\0b" }]) {
    assert.equal((await f.login(f.req(data))).status, 400);
  }
  assert.equal((await f.login(f.req(null, { malformed: true }))).status, 400);
  assert.equal(f.comparisons.length, 0);
  const retired = fixture(t, { retired: true });
  const denied = await signIn(retired);
  assert.equal(denied.status, 401);
  assert.equal(cookie(denied), undefined);
  assert.deepEqual(retired.rows(), []);
  const broken = fixture(t, { unavailable: true });
  const error = await signIn(broken);
  assert.equal(error.status, 500);
  assert.equal(cookie(error), undefined);
  for (const privateValue of [password, storedHash, "private database details"]) {
    assert.ok(!JSON.stringify(error.body).includes(privateValue));
  }
});

test("misconfigured origin fails closed and HTTP cookie is supported only on loopback", async (t) => {
  const bad = fixture(t, { configuredOrigin: "http://timetable.example" });
  assert.equal((await signIn(bad)).status, 503);
  assert.equal((await bad.logout(bad.req())).status, 503);
  const loopback = "http://localhost:3000";
  const local = fixture(t, { configuredOrigin: loopback });
  const response = await signIn(local, { origin: loopback });
  assert.equal(response.status, 200);
  assert.equal(cookie(response).secure, false);
});

test("a failed session insert rolls back revocation of the previous session", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  f.db.exec("CREATE TRIGGER fail_session BEFORE INSERT ON AdminSession BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  const response = await signIn(f, { token });
  assert.equal(response.status, 500);
  assert.equal(cookie(response), undefined);
  assert.equal(f.rows().length, 1);
  assert.equal((await f.readAdminSession(f.req(null, { token }))).adminId, 1);
});

test("every business handler enforces session checks before accessing its data", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  const forged = crypto.randomBytes(32).toString("base64url");
  const expired = cookie(await signIn(f)).value;
  f.db.prepare("UPDATE AdminSession SET expiresAt = ? WHERE tokenHash = ?")
    .run(new Date(0).toISOString(), sha256(expired));
  const routes = readdirSync(join(root, "app/api"), { recursive: true, withFileTypes: true })
    .filter((file) => file.isFile() && file.name === "route.ts" &&
      !file.parentPath.startsWith(join(root, "app/api/auth")));
  assert.equal(routes.length, 22);
  let checks = 0;
  const allowed = new Error("business code reached");
  const handlers = [];
  for (const route of routes) {
    const file = join(route.parentPath, route.name);
    const api = load(relative(root, file), {
      denyUnlessAdmin: async (req) => {
        const denied = await f.denyUnlessAdmin(req);
        if (!denied) throw allowed;
        return denied;
      },
    });
    for (const [method, handler] of Object.entries(api)) {
      const call = (sentToken, sentOrigin) => handler(f.req(null, { token: sentToken, origin: sentOrigin, method }), { params: { id: "1" } });
      handlers.push(call);
      for (const invalid of [undefined, forged, expired]) {
        assert.equal((await call(invalid)).status, 401, `${method} ${file}`);
      }
      if (method !== "GET") assert.equal((await call(token, "https://other.example")).status, 403);
      await assert.rejects(call(token), (error) => error === allowed);
      checks++;
    }
  }
  assert.equal(checks, 37);
  assert.equal((await f.logout(f.req(null, { token }))).status, 200);
  for (const call of handlers) assert.equal((await call(token)).status, 401);
});

test("database failure during authorization denies the request safely", async (t) => {
  const f = fixture(t);
  const token = cookie(await signIn(f)).value;
  f.db.exec("DROP TABLE AdminSession");
  const response = await f.denyUnlessAdmin(f.req(null, { token, method: "GET" }));
  assert.equal(response.status, 503);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.ok(!JSON.stringify(response.body).includes(token));
});
