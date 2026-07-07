import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { RequestContext } from "@huuma/route/http/request";
import { UnauthorizedException } from "@huuma/route/http/exception/unauthorized-exception";
import { Auth } from "./mod.ts";

function createContext(): RequestContext {
  return new RequestContext(new Request("https://app.example/protected"), {
    remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 43210 },
  });
}

const next = () => Promise.resolve(new Response("ok"));

Deno.test("Auth.protectWith throws when the strategy is not registered", () => {
  assertThrows(
    () => Auth.protectWith("unknown"),
    Error,
    "Strategy not defined!",
  );
});

Deno.test("Auth.protectWith authenticates the request when the strategy allows", async () => {
  Auth.strategy({
    name: "always-allow",
    authenticate: (_ctx, { allow }) => allow({ id: "user-1" }),
  });
  const ctx = createContext();

  const response = await Auth.protectWith("always-allow")(ctx, next);

  assertEquals(ctx.auth, { id: "user-1" });
  assertEquals(await response.text(), "ok");
});

Deno.test("Auth.protectWith responds unauthorized with the deny reason", async () => {
  Auth.strategy({
    name: "always-deny",
    authenticate: (_ctx, { deny }) => deny("invalid api key"),
  });

  await assertRejects(
    async () => await Auth.protectWith("always-deny")(createContext(), next),
    UnauthorizedException,
    "invalid api key",
  );
});

Deno.test("Auth.protectWith supports strategies that allow asynchronously", async () => {
  Auth.strategy({
    name: "async-allow",
    authenticate: async (_ctx, { allow }) => {
      await Promise.resolve();
      allow("session-42");
    },
  });
  const ctx = createContext();

  await Auth.protectWith("async-allow")(ctx, next);

  assertEquals(ctx.auth, "session-42");
});

Deno.test("Auth.protectWith rethrows errors thrown by a strategy unchanged", async () => {
  Auth.strategy({
    name: "sync-throw",
    authenticate: () => {
      throw new Error("database unreachable at 10.0.0.5");
    },
  });

  const error = await assertRejects(
    async () => await Auth.protectWith("sync-throw")(createContext(), next),
    Error,
    "database unreachable at 10.0.0.5",
  );
  assertFalse(error instanceof UnauthorizedException);
});

Deno.test("Auth.protectWith rethrows string values thrown by a strategy", async () => {
  Auth.strategy({
    name: "string-throw",
    authenticate: () => {
      throw "session store unreachable at 10.0.0.5";
    },
  });

  const error = await assertRejects(
    async () => await Auth.protectWith("string-throw")(createContext(), next),
  );

  assertEquals(error, "session store unreachable at 10.0.0.5");
});

Deno.test("Auth.protectWith rethrows async strategy rejections unchanged", async () => {
  Auth.strategy({
    name: "async-throw",
    authenticate: async () => {
      await Promise.resolve();
      throw new Error("session lookup failed");
    },
  });

  const error = await assertRejects(
    async () => await Auth.protectWith("async-throw")(createContext(), next),
    Error,
    "session lookup failed",
  );
  assertFalse(error instanceof UnauthorizedException);
});
