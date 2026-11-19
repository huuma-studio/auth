import { expect, test } from "vite-plus/test";
import { RequestContext } from "@huuma/route/http/request";
import { UnauthorizedException } from "@huuma/route/http/exception/unauthorized-exception";
import { Auth, Authenticator, type Strategy } from "./mod.ts";

function createContext(): RequestContext {
  return new RequestContext(new Request("https://app.example/protected"), {
    remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 43210 },
  });
}

const next = () => Promise.resolve(new Response("ok"));

test("Authenticator.protectWith authenticates the request when the strategy allows", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "always-allow",
    authenticate: (_ctx, { allow }) => allow({ id: "user-1" }),
  });
  const ctx = createContext();

  const response = await auth.protectWith("always-allow")(ctx, next);

  expect(ctx.auth).toEqual({ id: "user-1" });
  expect(await response.text()).toEqual("ok");
});

test("Authenticator.protectWith supports strategies that allow asynchronously", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "async-allow",
    authenticate: async (_ctx, { allow }) => {
      await Promise.resolve();
      allow("session-42");
    },
  });
  const ctx = createContext();

  await auth.protectWith("async-allow")(ctx, next);

  expect(ctx.auth).toEqual("session-42");
});

test("Authenticator.strategy returns the instance for chaining", async () => {
  const auth = new Authenticator();
  const first: Strategy<string> = {
    name: "first",
    authenticate: (_ctx, { allow }) => allow("one"),
  };
  const second: Strategy<string> = {
    name: "second",
    authenticate: (_ctx, { allow }) => allow("two"),
  };

  expect(auth.strategy(first)).toBe(auth);
  expect(auth.strategy(second)).toBe(auth);

  const firstCtx = createContext();
  const secondCtx = createContext();
  await auth.protectWith("first")(firstCtx, next);
  await auth.protectWith("second")(secondCtx, next);

  expect(firstCtx.auth).toEqual("one");
  expect(secondCtx.auth).toEqual("two");
});

test("Authenticator.protectWith responds unauthorized with the deny reason", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "always-deny",
    authenticate: (_ctx, { deny }) => deny("invalid api key"),
  });

  const result = auth.protectWith("always-deny")(createContext(), next);

  await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(result).rejects.toThrow("invalid api key");
});

test("Authenticator.protectWith rethrows errors thrown by a strategy unchanged", async () => {
  const auth = new Authenticator();
  const expected = new Error("database unreachable at 10.0.0.5");
  auth.strategy({
    name: "sync-throw",
    authenticate: () => {
      throw expected;
    },
  });

  await expect(
    auth.protectWith("sync-throw")(createContext(), next),
  ).rejects.toBe(expected);
});

test("Authenticator.protectWith rethrows string values thrown by a strategy", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "string-throw",
    authenticate: () => {
      throw "session store unreachable at 10.0.0.5";
    },
  });

  await expect(
    auth.protectWith("string-throw")(createContext(), next),
  ).rejects.toBe("session store unreachable at 10.0.0.5");
});

test("Authenticator.protectWith rethrows async strategy rejections unchanged", async () => {
  const auth = new Authenticator();
  const expected = new Error("session lookup failed");
  auth.strategy({
    name: "async-throw",
    authenticate: async () => {
      await Promise.resolve();
      throw expected;
    },
  });

  await expect(
    auth.protectWith("async-throw")(createContext(), next),
  ).rejects.toBe(expected);
});

test("Authenticator.strategy throws when a strategy with the same name is already registered", async () => {
  const auth = new Authenticator();
  const first: Strategy<string> = {
    name: "foo",
    authenticate: (_ctx, { allow }) => allow("first"),
  };
  const duplicate: Strategy<string> = {
    name: "foo",
    authenticate: (_ctx, { allow }) => allow("second"),
  };

  auth.strategy(first);

  expect(() => auth.strategy(duplicate)).toThrow(
    'A strategy named "foo" is already registered',
  );

  const ctx = createContext();
  await auth.protectWith("foo")(ctx, next);
  expect(ctx.auth).toEqual("first");
});

test("Authenticator.protectWith reports the missing strategy name", () => {
  const auth = new Authenticator();

  expect(() => auth.protectWith("unknown")).toThrow(
    'No strategy registered for "unknown"',
  );
});

test("Authenticator instances are isolated", async () => {
  const first = new Authenticator();
  const second = new Authenticator();
  first.strategy({
    name: "x",
    authenticate: (_ctx, { allow }) => allow("from-first"),
  });

  expect(() => second.protectWith("x")).toThrow(
    'No strategy registered for "x"',
  );

  const ctx = createContext();
  await first.protectWith("x")(ctx, next);
  expect(ctx.auth).toEqual("from-first");
});

function withSettleGuard<T>(run: () => T | Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const neverSettled = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("middleware never settled")),
      250,
    );
  });
  return Promise.race([Promise.resolve(run()), neverSettled]).finally(() =>
    clearTimeout(timeoutId),
  );
}

test("Authenticator.protectWith rejects when a sync strategy returns without settling", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "sync-never-settle",
    authenticate: () => {},
  });

  const result = withSettleGuard(() =>
    auth.protectWith("sync-never-settle")(createContext(), next),
  );

  await expect(result).rejects.toThrow("without calling allow or deny");
  await expect(result).rejects.not.toBeInstanceOf(UnauthorizedException);
});

test("Authenticator.protectWith rejects when an async strategy resolves without settling", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "async-never-settle",
    authenticate: async () => {
      await Promise.resolve();
    },
  });

  const result = withSettleGuard(() =>
    auth.protectWith("async-never-settle")(createContext(), next),
  );

  await expect(result).rejects.toThrow("without calling allow or deny");
  await expect(result).rejects.not.toBeInstanceOf(UnauthorizedException);
});

test("Authenticator.protectWith still authenticates when a strategy rejects after allow", async () => {
  const auth = new Authenticator();
  auth.strategy({
    name: "late-reject",
    authenticate: async (_ctx, { allow }) => {
      allow("user-1");
      await Promise.resolve();
      throw new Error("late failure");
    },
  });
  const ctx = createContext();

  const response = await auth.protectWith("late-reject")(ctx, next);

  expect(ctx.auth).toEqual("user-1");
  expect(await response.text()).toEqual("ok");
});

test("Auth is a shared Authenticator instance", async () => {
  expect(Auth).toBeInstanceOf(Authenticator);

  Auth.strategy({
    name: "auth-singleton-pin",
    authenticate: (_ctx, { allow }) => allow("singleton-user"),
  });
  const ctx = createContext();

  const response = await Auth.protectWith("auth-singleton-pin")(ctx, next);

  expect(ctx.auth).toEqual("singleton-user");
  expect(await response.text()).toEqual("ok");
});
