/**
 * Authentication middleware for {@link https://jsr.io/@huuma/route | @huuma/route}.
 *
 * Register a {@linkcode Strategy} with {@linkcode Auth.strategy} or an
 * {@linkcode Authenticator} instance and protect routes with the middleware
 * returned by `protectWith`.
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
 * An authentication mechanism, registered via
 * {@linkcode Authenticator.strategy} or {@linkcode Auth.strategy} and looked
 * up by its unique `name`.
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

class AuthenticationDenied {
  constructor(public reason: string) {}
}

function authentication<T>(
  strategy: Strategy<T>,
  ctx: RequestContext,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const attempt = strategy.authenticate(ctx, {
      allow: resolve,
      deny: (reason) => reject(new AuthenticationDenied(reason)),
    });
    if (attempt instanceof Promise) {
      attempt.catch((e) => {
        reject(e);
      });
    }
  });
}

/** Registers authentication strategies and protects routes with them. */
export class Authenticator {
  #strategies = new Map<string, Strategy<unknown>>();

  /** Registers a strategy under its `name`. Throws if the name is already taken. */
  strategy<T>(strategy: Strategy<T>): this {
    if (this.#strategies.has(strategy.name)) {
      throw new Error(
        `A strategy named "${strategy.name}" is already registered`,
      );
    }

    this.#strategies.set(strategy.name, strategy);
    return this;
  }

  /**
   * Returns a middleware that runs the named strategy: on `allow` the entity is
   * assigned to `ctx.auth` and the chain continues; on `deny` an
   * `UnauthorizedException` with the reason is thrown; unexpected errors are
   * rethrown unchanged. Throws immediately if no strategy is registered under
   * `name`.
   */
  protectWith<T>(strategyName: string): Middleware {
    const strategy = this.#strategies.get(strategyName) as
      | Strategy<T>
      | undefined;
    if (!strategy) {
      throw new Error(`No strategy registered for "${strategyName}"`);
    }

    return async (ctx: RequestContext, next: Next): Promise<Response> => {
      try {
        ctx.auth = await authentication<T>(strategy, ctx);
      } catch (e) {
        if (e instanceof AuthenticationDenied) {
          throw new UnauthorizedException(e.reason);
        }
        throw e;
      }
      return next();
    };
  }
}

/**
 * Default shared authenticator instance, kept for ergonomic one-app usage.
 *
 * `Auth.strategy(strategy)` registers a strategy under its `name`.
 * `Auth.protectWith(name)` returns a middleware that runs the strategy.
 */
export const Auth: Authenticator = new Authenticator();
