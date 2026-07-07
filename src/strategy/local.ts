/**
 * {@linkcode LocalStrategy} authenticates requests with a username and
 * password submitted in the request body.
 *
 * @module
 */

import type { RequestContext } from "@huuma/route/http/request";
import type { Instructions, Strategy } from "../mod.ts";

/** Credentials submitted in the request body of a login request. */
export interface LocalStrategyCredentials {
  /** Submitted username; guaranteed to be a non-empty string. */
  username: string;
  /** Submitted password; guaranteed to be a non-empty string. */
  password: string;
}

/**
 * Username/password authentication against the parsed request body.
 *
 * Credentials are read from `ctx.body`, so the app must run a body-parsing
 * middleware (e.g. `bodyParser()` from `@huuma/route`) before this strategy.
 * Requests without a non-empty string `username` and `password` are denied
 * before the handler is invoked; credentials are never read from the URL,
 * keeping them out of access logs and browser history.
 *
 * @example
 * ```ts
 * Auth.strategy(
 *   new LocalStrategy(async ({ username, password }, { allow, deny }) => {
 *     const user = await findUser(username);
 *     if (user && (await verify(user.passwordHash, password))) {
 *       return allow(user);
 *     }
 *     deny("wrong username or password");
 *   }),
 * );
 * ```
 */
export class LocalStrategy<T> implements Strategy<T> {
  /** Name the strategy is registered under. */
  name = "local";

  /**
   * Creates the strategy with a handler that verifies the submitted
   * credentials and settles the request by calling `allow` or `deny`.
   */
  constructor(
    private handler: (
      credentials: LocalStrategyCredentials,
      instructions: Instructions<T>,
    ) => void | Promise<void>,
  ) {}

  /** Reads credentials from `ctx.body` and runs the handler. */
  authenticate(
    ctx: RequestContext,
    { allow, deny }: Instructions<T>,
  ): void | Promise<void> {
    const { username, password } = <Partial<LocalStrategyCredentials>> (
      ctx.body ?? {}
    );

    if (
      typeof username === "string" && username.length &&
      typeof password === "string" && password.length
    ) {
      return this.handler({ username, password }, { allow, deny });
    }

    deny('"username" or/and "password" not submitted!');
  }
}
