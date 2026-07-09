import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { RequestContext } from "@huuma/route/http/request";
import { UnauthorizedException } from "@huuma/route/http/exception/unauthorized-exception";
import { Auth, Authenticator, type Strategy } from "./mod.ts";

function createContext(): RequestContext {
  return new RequestContext(new Request("https://app.example/protected"), {
    remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 43210 },
  });
}

const next = () => Promise.resolve(new Response("ok"));

Deno.test("Authenticator.protectWith authenticates the request when the strategy allows", async () => {
  const auth = new Authenticator();
  auth.use({
    name: "always-allow",
    authenticate: (_ctx, { allow }) => allow({ id: "user-1" }),
  });
  const ctx = createContext();

  const response = await auth.protectWith("always-allow")(ctx, next);

  assertEquals(ctx.auth, { id: "user-1" });
  assertEquals(await response.text(), "ok");
});

Deno.test("Authenticator.protectWith supports strategies that allow asynchronously", async () => {
  const auth = new Authenticator();
  auth.use({
    name: "async-allow",
    authenticate: async (_ctx, { allow }) => {
      await Promise.resolve();
      allow("session-42");
    },
  });
  const ctx = createContext();

  await auth.protectWith("async-allow")(ctx, next);

  assertEquals(ctx.auth, "session-42");
});

Deno.test("Authenticator.use returns the instance for chaining", async () => {
  const auth = new Authenticator();
  const first: Strategy<string> = {
    name: "first",
    authenticate: (_ctx, { allow }) => allow("one"),
  };
  const second: Strategy<string> = {
    name: "second",
    authenticate: (_ctx, { allow }) => allow("two"),
  };

  assertEquals(auth.use(first), auth);
  assertEquals(auth.use(second), auth);

  const firstCtx = createContext();
  const secondCtx = createContext();
  await auth.protectWith("first")(firstCtx, next);
  await auth.protectWith("second")(secondCtx, next);

  assertEquals(firstCtx.auth, "one");
  assertEquals(secondCtx.auth, "two");
});

Deno.test("Authenticator.protectWith responds unauthorized with the deny reason", async () => {
  const auth = new Authenticator();
  auth.use({
    name: "always-deny",
    authenticate: (_ctx, { deny }) => deny("invalid api key"),
  });

  await assertRejects(
    async () => await auth.protectWith("always-deny")(createContext(), next),
    UnauthorizedException,
    "invalid api key",
  );
});

Deno.test("Authenticator.protectWith rethrows errors thrown by a strategy unchanged", async () => {
  const auth = new Authenticator();
  const expected = new Error("database unreachable at 10.0.0.5");
  auth.use({
    name: "sync-throw",
    authenticate: () => {
      throw expected;
    },
  });

  const error = await assertRejects(
    async () => await auth.protectWith("sync-throw")(createContext(), next),
    Error,
    "database unreachable at 10.0.0.5",
  );
  assertEquals(error, expected);
  assertFalse(error instanceof UnauthorizedException);
});

Deno.test("Authenticator.protectWith rethrows string values thrown by a strategy", async () => {
  const auth = new Authenticator();
  auth.use({
    name: "string-throw",
    authenticate: () => {
      throw "session store unreachable at 10.0.0.5";
    },
  });

  const error = await assertRejects(
    async () => await auth.protectWith("string-throw")(createContext(), next),
  );

  assertEquals(error, "session store unreachable at 10.0.0.5");
});

Deno.test("Authenticator.protectWith rethrows async strategy rejections unchanged", async () => {
  const auth = new Authenticator();
  const expected = new Error("session lookup failed");
  auth.use({
    name: "async-throw",
    authenticate: async () => {
      await Promise.resolve();
      throw expected;
    },
  });

  const error = await assertRejects(
    async () => await auth.protectWith("async-throw")(createContext(), next),
    Error,
    "session lookup failed",
  );
  assertEquals(error, expected);
  assertFalse(error instanceof UnauthorizedException);
});

Deno.test("Authenticator.use throws when a strategy with the same name is already registered", async () => {
  const auth = new Authenticator();
  const first: Strategy<string> = {
    name: "foo",
    authenticate: (_ctx, { allow }) => allow("first"),
  };
  const duplicate: Strategy<string> = {
    name: "foo",
    authenticate: (_ctx, { allow }) => allow("second"),
  };

  auth.use(first);

  assertThrows(
    () => auth.use(duplicate),
    Error,
    'A strategy named "foo" is already registered',
  );

  const ctx = createContext();
  await auth.protectWith("foo")(ctx, next);
  assertEquals(ctx.auth, "first");
});

Deno.test("Authenticator.protectWith reports the missing strategy name", () => {
  const auth = new Authenticator();

  assertThrows(
    () => auth.protectWith("unknown"),
    Error,
    'No strategy registered for "unknown"',
  );
});

Deno.test("Authenticator.disuse removes a strategy so protectWith throws for it", () => {
  const auth = new Authenticator();
  auth.use({
    name: "foo",
    authenticate: (_ctx, { allow }) => allow("first"),
  });

  assertEquals(auth.disuse("foo"), auth);
  assertThrows(
    () => auth.protectWith("foo"),
    Error,
    'No strategy registered for "foo"',
  );
});

Deno.test("Authenticator.disuse is a no-op for names that were never registered", () => {
  const auth = new Authenticator();

  assertEquals(auth.disuse("ghost"), auth);
});

Deno.test("Authenticator instances are isolated", async () => {
  const first = new Authenticator();
  const second = new Authenticator();
  first.use({
    name: "x",
    authenticate: (_ctx, { allow }) => allow("from-first"),
  });

  assertThrows(
    () => second.protectWith("x"),
    Error,
    'No strategy registered for "x"',
  );

  const ctx = createContext();
  await first.protectWith("x")(ctx, next);
  assertEquals(ctx.auth, "from-first");
});

Deno.test("Auth is a shared Authenticator instance", async () => {
  assertEquals(Auth instanceof Authenticator, true);

  Auth.use({
    name: "auth-singleton-pin",
    authenticate: (_ctx, { allow }) => allow("singleton-user"),
  });
  const ctx = createContext();

  const response = await Auth.protectWith("auth-singleton-pin")(ctx, next);

  assertEquals(ctx.auth, "singleton-user");
  assertEquals(await response.text(), "ok");
});
