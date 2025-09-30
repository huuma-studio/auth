import type { Middleware, Next } from "@huuma/route/middleware";
import { UnauthorizedException } from "@huuma/route/http/exception/unauthorized-exception";
import type { RequestContext } from "@huuma/route/http/request";

export interface Instructions<T> {
  allow: (entity: T) => void;
  deny: (reason: string) => void;
}

export interface Strategy<T> {
  name: string;
  authenticate: (
    ctx: RequestContext,
    instructions: Instructions<T>,
  ) => Promise<void> | void;
}

function authentication<T>(
  { authenticate }: Strategy<T>,
  ctx: RequestContext,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const attempt = authenticate(ctx, { allow: resolve, deny: reject });
    if (attempt instanceof Promise) {
      attempt.catch((e) => {
        reject(e);
      });
    }
  });
}

const strategies: Strategy<unknown>[] = [];

function protectWith<T>(strategyName: string): Middleware {
  const strategy = <Strategy<T> | undefined>(
    strategies.find((strategy) => strategy.name == strategyName)
  );
  if (strategy) {
    return async (ctx: RequestContext, next: Next): Promise<Response> => {
      try {
        ctx.auth = await authentication<T>(strategy, ctx);
      } catch (e) {
        console.error(e);
        throw new UnauthorizedException(
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : "Unknown authentication error",
        );
      }
      return next();
    };
  }
  throw Error("Strategy not defined!");
}

function strategy<T>(strategy: Strategy<T>) {
  strategies.push(strategy);
}

export const Auth = {
  protectWith,
  strategy,
};
