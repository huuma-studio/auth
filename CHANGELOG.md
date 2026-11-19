# Changelog

All notable changes to `@huuma/auth` are listed here, starting with 0.4.0. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] - 2026-11-19

### Breaking

- `@huuma/route` 0.3.2 or later is required. Its `RequestContext` has private fields, so TypeScript doesn't accept a middleware typed against one version of `@huuma/route` in an app that uses another: update both together. See the [`@huuma/route` changelog](https://github.com/huuma-studio/route/blob/main/CHANGELOG.md) for its changes.

### Changed

- The README and the `LocalStrategy` example pass only public user fields to `allow()`, not the whole user record with its password hash. `ctx.auth` holds what `allow()` gets, and the login route responds with it.

[0.4.0]: https://jsr.io/@huuma/auth@0.4.0
