import { expect, test } from "vite-plus/test";
import { RequestContext } from "@huuma/route/http/request";
import { Authenticator, type Strategy } from "../mod.ts";
import { LocalStrategy } from "./local.ts";

function createLoginContext(body?: unknown): RequestContext {
  const ctx = new RequestContext(
    new Request("https://app.example/login", { method: "POST" }),
    {
      remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 43210 },
    },
  );
  ctx.body = body;
  return ctx;
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

test("LocalStrategy denies when username or password is not submitted", async () => {
  const strategy = new LocalStrategy<string>((_credentials, { allow }) => {
    allow("someone");
  });

  await expect(
    authenticate(strategy, createLoginContext({ username: "alice" })),
  ).rejects.toBe('"username" or/and "password" not submitted!');
});

test("LocalStrategy denies when the request has no body", async () => {
  const strategy = new LocalStrategy<string>((_credentials, { allow }) => {
    allow("someone");
  });

  await expect(authenticate(strategy, createLoginContext())).rejects.toBe(
    '"username" or/and "password" not submitted!',
  );
});

test("LocalStrategy denies when submitted credentials are not strings", async () => {
  const strategy = new LocalStrategy<string>((_credentials, { allow }) => {
    allow("someone");
  });

  await expect(
    authenticate(
      strategy,
      createLoginContext({ username: ["alice"], password: { $ne: "" } }),
    ),
  ).rejects.toBe('"username" or/and "password" not submitted!');
});

test("LocalStrategy authenticates when the handler accepts the credentials", async () => {
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
    createLoginContext({ username: "alice", password: "wonderland" }),
  );

  expect(user).toEqual("alice");
});

test("LocalStrategy reports the handler's deny reason", async () => {
  const strategy = new LocalStrategy<string>((_credentials, { deny }) => {
    deny("wrong password");
  });

  await expect(
    authenticate(
      strategy,
      createLoginContext({ username: "alice", password: "nope" }),
    ),
  ).rejects.toBe("wrong password");
});

test("LocalStrategy authenticates when the handler verifies credentials asynchronously", async () => {
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
    createLoginContext({ username: "alice", password: "wonderland" }),
  );

  expect(user).toEqual("alice");
});

test("local strategy protects a route through Authenticator.protectWith", async () => {
  const auth = new Authenticator();
  auth.strategy(
    new LocalStrategy<{ username: string }>(
      ({ username, password }, { allow, deny }) => {
        if (username === "alice" && password === "wonderland") {
          return allow({ username: "alice" });
        }
        deny("wrong credentials");
      },
    ),
  );
  const ctx = createLoginContext({ username: "alice", password: "wonderland" });

  const response = await auth.protectWith("local")(ctx, () =>
    Promise.resolve(new Response("welcome")),
  );

  expect(ctx.auth).toEqual({ username: "alice" });
  expect(await response.text()).toEqual("welcome");
});
