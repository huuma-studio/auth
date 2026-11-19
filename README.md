# @huuma/auth

Authentication middleware for [@huuma/route](https://jsr.io/@huuma/route).
Register an authentication strategy once, then protect routes with a middleware
that runs it.

## Installation

```sh
deno add jsr:@huuma/auth
```

## Usage

```ts
import { Auth } from "@huuma/auth";
import { CustomStrategy } from "@huuma/auth/strategy/custom";

Auth.strategy(
  new CustomStrategy(async (ctx, { allow, deny }) => {
    const session = await findSession(ctx.request.headers.get("cookie"));
    session ? allow(session.user) : deny("invalid session");
  }),
);

app.get("/profile", { middleware: [Auth.protectWith("custom")] }, (ctx) => {
  // ctx.auth holds the entity passed to allow()
  return Response.json(ctx.auth);
});
```

A strategy settles every request by calling exactly one of:

- `allow(entity)` — authenticates the request; `entity` becomes `ctx.auth` and
  the middleware chain continues.
- `deny(reason)` — responds with `401 Unauthorized`. The reason is sent to the
  client, so it must not contain internal details.

Errors a strategy throws (or rejections of a promise it returns) are rethrown
unchanged and handled by the framework's exception handling as a generic
`500 Internal Server Error` — a broken session store is not an authentication
failure, and its message never reaches the client.

## Strategies

### `LocalStrategy`

Username/password authentication against the parsed request body. Requires a
body-parsing middleware (e.g. `bodyParser()` from `@huuma/route`) to run first;
credentials are never read from the URL, keeping them out of access logs and
browser history. Requests without a non-empty string `username` and `password`
are denied before the handler runs.

```ts
import { bodyParser } from "@huuma/route/middleware/body-parser";
import { LocalStrategy } from "@huuma/auth/strategy/local";

app.middleware(bodyParser());

Auth.strategy(
  new LocalStrategy(async ({ username, password }, { allow, deny }) => {
    const user = await findUser(username);
    if (user && (await verify(user.passwordHash, password))) {
      return allow(user);
    }
    deny("wrong username or password");
  }),
);

app.post("/login", { middleware: [Auth.protectWith("local")] }, (ctx) => {
  return Response.json(ctx.auth);
});
```

### `CustomStrategy`

Receives the full `RequestContext` — implement any scheme: bearer tokens, API
keys, cookies, signatures.

### Your own

Any object implementing the `Strategy` interface can be registered:

```ts
import type { Strategy } from "@huuma/auth";

const apiKey: Strategy<{ client: string }> = {
  name: "api-key",
  authenticate(ctx, { allow, deny }) {
    ctx.request.headers.get("x-api-key") === Deno.env.get("API_KEY")
      ? allow({ client: "internal" })
      : deny("invalid api key");
  },
};

Auth.strategy(apiKey);
```

Strategies are looked up by `name`, so each registered strategy needs a unique
one.

## Multiple apps or test isolation

Use `Authenticator` directly when you need isolated strategy registries for
multiple apps in one process or per-test isolation.

```ts
import { Authenticator } from "@huuma/auth";
import { CustomStrategy } from "@huuma/auth/strategy/custom";

const auth = new Authenticator();
auth.strategy(
  new CustomStrategy((ctx, { allow, deny }) => {
    const token = ctx.request.headers.get("authorization");
    token === "Bearer secret" ? allow({ id: 1 }) : deny("invalid token");
  }),
);

app.get("/profile", { middleware: [auth.protectWith("custom")] }, handler);
```

## Development

Install [Vite+](https://viteplus.dev/guide/) and use the pinned Node.js and pnpm
versions:

```sh
vp install
vp check
vp test
```

`vp check` checks formatting, lint rules, and TypeScript types. `vp test` runs
the test suite. Use `vp fmt` to format files and `vp lint` to run lint and type
checks separately.

## Publishing

The package is published as TypeScript source to
[JSR](https://jsr.io/@huuma/auth). Package metadata, exports, and the publishing
file list are defined in `jsr.json`; `package.json` configures development
dependencies and commands. No build step is required.

```sh
vp run publish:check
vp run release
```

`publish:check` validates the package without uploading it. To release a new
version, update `version` in `jsr.json`. CI runs checks, tests, and a publishing
dry run for pull requests and pushes to `main`, then publishes pushes to `main`
using JSR's GitHub OIDC authentication.

## License

MIT
