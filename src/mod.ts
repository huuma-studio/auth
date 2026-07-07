/**
 * Authentication middleware for {@link https://jsr.io/@huuma/route | @huuma/route}.
 *
 * Register a {@linkcode Strategy} with {@linkcode Auth.strategy} and protect
 * routes with the middleware returned by {@linkcode Auth.protectWith}.
 *
 * @module
 */

import type { Middleware, Next } from "@huuma/route/middleware";
import { UnauthorizedException } from "@huuma/route/http/exception/unauthorized-exception";
import type { RequestContext } from "@huuma/route/http/request";

/**
 * Callbacks a {@linkcode Strategy} uses to settle an authentication attempt.
 * Exactly one of them must be called per attempt.
 */
export interface Instructions<T> {
  /** Authenticates the request; `entity` becomes `ctx.auth`. */
  allow: (entity: T) => void;
  /**
   * Rejects the request. The reason is sent to the client in the
   * 401 response, so it must not contain internal details.
   */
  deny: (reason: string) => void;
}

/**
 * An authentication mechanism, registered via {@linkcode Auth.strategy} and
 * looked up by its unique `name`.
 *
 * `authenticate` must settle every attempt by calling `allow` or `deny`, or
 * by throwing. Thrown errors and rejections of a returned promise are treated
 * as unexpected failures and rethrown to the framework's exception handling.
 */
export interface Strategy<T> {
  /** Unique name the strategy is registered and looked up by. */
  name: string;
  /** Runs the authentication attempt for a request. */
  authenticate: (
    ctx: RequestContext,
    instructions: Instructions<T>,
  ) => Promise<void> | void;
}

function authentication<T>(
  strategy: Strategy<T>,
  ctx: RequestContext,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const attempt = strategy.authenticate(ctx, {
      allow: resolve,
      deny: reject,
    });
    if (attempt instanceof Promise) {
      attempt.catch((e) => {
        reject(e);
      });
    }
  });
}

const strategies: Strategy<unknown>[] = [];

function protectWith<T>(strategyName: string): Middleware {
  const strategy = <Strategy<T> | undefined> (
    strategies.find((strategy) => strategy.name == strategyName)
  );
  if (strategy) {
    return async (ctx: RequestContext, next: Next): Promise<Response> => {
      try {
        ctx.auth = await authentication<T>(strategy, ctx);
      } catch (e) {
        if (typeof e === "string") {
          throw new UnauthorizedException(e);
        }
        throw e;
      }
      return next();
    };
  }
  throw Error("Strategy not defined!");
}

function strategy<T>(strategy: Strategy<T>) {
  strategies.push(strategy);
}

/**
 * Registers authentication strategies and protects routes with them.
 *
 * `Auth.strategy(strategy)` registers a strategy under its `name`.
 * `Auth.protectWith(name)` returns a middleware that runs the strategy:
 * on `allow` the entity is assigned to `ctx.auth` and the chain continues;
 * on `deny` an `UnauthorizedException` with the reason is thrown; unexpected
 * errors are rethrown unchanged. Throws immediately when no strategy is
 * registered under `name`.
 *
 * @example
 * ```ts
 * Auth.strategy(new CustomStrategy((ctx, { allow, deny }) => {
 *   const token = ctx.request.headers.get("authorization");
 *   token === "Bearer secret" ? allow({ id: 1 }) : deny("invalid token");
 * }));
 *
 * app.get("/profile", { middleware: [Auth.protectWith("custom")] }, handler);
 * ```
 */
export const Auth = {
  protectWith,
  strategy,
};
