import { assertEquals, assertRejects } from "@std/assert";
import { getSearchParams, RequestContext } from "@huuma/route/http/request";
import { Auth, type Strategy } from "../mod.ts";
import { LocalStrategy } from "./local.ts";

function createLoginContext(query: string): RequestContext {
  const ctx = new RequestContext(
    new Request(`https://app.example/login${query}`),
    { remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 43210 } },
  );
  ctx.search = getSearchParams(ctx.request);
  return ctx;
}

function authenticate<T>(
  strategy: Strategy<T>,
  ctx: RequestContext,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    strategy.authenticate(ctx, { allow: resolve, deny: reject });
  });
}

Deno.test("LocalStrategy denies when username or password is not submitted", async () => {
  const strategy = new LocalStrategy<string>((_credentials, { allow }) => {
    allow("someone");
  });

  const reason = await assertRejects(() =>
    authenticate(strategy, createLoginContext("?username=alice"))
  );

  assertEquals(reason, '"username" or/and "password" not submitted!');
});

Deno.test("LocalStrategy authenticates when the handler accepts the credentials", async () => {
  const strategy = new LocalStrategy<string>(
    ({ username, password }, { allow, deny }) => {
      if (username === "alice" && password === "wonderland") {
        return allow("alice");
      }
      deny("wrong credentials");
    },
  );

  const user = await authenticate(
    strategy,
    createLoginContext("?username=alice&password=wonderland"),
  );

  assertEquals(user, "alice");
});

Deno.test("LocalStrategy reports the handler's deny reason", async () => {
  const strategy = new LocalStrategy<string>((_credentials, { deny }) => {
    deny("wrong password");
  });

  const reason = await assertRejects(() =>
    authenticate(strategy, createLoginContext("?username=alice&password=nope"))
  );

  assertEquals(reason, "wrong password");
});

Deno.test("LocalStrategy authenticates when the handler verifies credentials asynchronously", async () => {
  const strategy = new LocalStrategy<string>(
    async ({ username, password }, { allow, deny }) => {
      await Promise.resolve(); // e.g. async password hash verification
      if (username === "alice" && password === "wonderland") {
        return allow("alice");
      }
      deny("wrong credentials");
    },
  );

  const user = await authenticate(
    strategy,
    createLoginContext("?username=alice&password=wonderland"),
  );

  assertEquals(user, "alice");
});

Deno.test("local strategy protects a route through Auth.protectWith", async () => {
  Auth.strategy(
    new LocalStrategy<{ username: string }>(
      ({ username, password }, { allow, deny }) => {
        if (username === "alice" && password === "wonderland") {
          return allow({ username: "alice" });
        }
        deny("wrong credentials");
      },
    ),
  );
  const ctx = createLoginContext("?username=alice&password=wonderland");

  const response = await Auth.protectWith("local")(
    ctx,
    () => Promise.resolve(new Response("welcome")),
  );

  assertEquals(ctx.auth, { username: "alice" });
  assertEquals(await response.text(), "welcome");
});
