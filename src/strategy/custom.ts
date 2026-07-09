/**
 * {@linkcode CustomStrategy} authenticates requests with a user-provided
 * handler — implement bearer tokens, API keys, cookies, or any other scheme.
 *
 * @module
 */

import type { RequestContext } from "@huuma/route/http/request";
import type { Instructions, Strategy } from "../mod.ts";

/**
 * Authentication with a user-provided handler that receives the full
 * {@linkcode RequestContext} — for token, header, cookie, or any other
 * scheme. The handler must settle every request by calling `allow` or
 * `deny`; errors it throws are rethrown to the framework's exception
 * handling.
 *
 * @example
 * ```ts
 * Auth.use(
 *   new CustomStrategy(async (ctx, { allow, deny }) => {
 *     const session = await findSession(ctx.request.headers.get("cookie"));
 *     session ? allow(session.user) : deny("invalid session");
 *   }),
 * );
 * ```
 */
export class CustomStrategy<T> implements Strategy<T> {
  /** Name the strategy is registered under. */
  name = "custom";

  /**
   * Creates the strategy with a handler that settles each request by
   * calling `allow` or `deny`.
   */
  constructor(
    private handler: (
      ctx: RequestContext,
      instructions: Instructions<T>,
    ) => void | Promise<void>,
  ) {}

  /** Runs the handler for the request. */
  authenticate(
    ctx: RequestContext,
    { allow, deny }: Instructions<T>,
  ): void | Promise<void> {
    return this.handler(ctx, { allow, deny });
  }
}
