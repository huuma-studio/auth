import { assertEquals, assertRejects } from "@std/assert";
import { RequestContext } from "@huuma/route/http/request";
import { Auth, type Strategy } from "../mod.ts";
import { CustomStrategy } from "./custom.ts";

function createContext(init?: RequestInit): RequestContext {
  return new RequestContext(
    new Request("https://app.example/protected", init),
    { remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 43210 } },
  );
}

function authenticate<T>(
  strategy: Strategy<T>,
  ctx: RequestContext,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const attempt = strategy.authenticate(ctx, {
      allow: resolve,
      deny: reject,
    });
    if (attempt instanceof Promise) {
      attempt.catch(reject);
    }
  });
}

Deno.test("custom strategy authenticates through Auth.protectWith", async () => {
  Auth.strategy(
    new CustomStrategy<string>((ctx, { allow, deny }) => {
      if (ctx.request.headers.get("authorization") === "Bearer valid-token") {
        return allow("token-user");
      }
      deny("invalid token");
    }),
  );
  const ctx = createContext({
    headers: { authorization: "Bearer valid-token" },
  });

  const response = await Auth.protectWith("custom")(
    ctx,
    () => Promise.resolve(new Response("ok")),
  );

  assertEquals(ctx.auth, "token-user");
  assertEquals(await response.text(), "ok");
});

Deno.test("CustomStrategy rejects the request when an async handler throws", async () => {
  const strategy = new CustomStrategy(async () => {
    await Promise.resolve();
    throw new Error("session store unreachable");
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const neverSettled = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("authentication never settled")),
      250,
    );
  });

  try {
    await assertRejects(
      () =>
        Promise.race([authenticate(strategy, createContext()), neverSettled]),
      Error,
      "session store unreachable",
    );
  } finally {
    clearTimeout(timeoutId);
  }
});
