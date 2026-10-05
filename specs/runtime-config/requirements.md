# Runtime service configuration — requirements

## Why

Every Cloistr frontend bakes production hostnames into its image when the image
is built. A staging deployment of any current image would therefore talk to the
production relay, the production signer and the production file host, and a
staging signup would create a real account in production.

Measured 2026-10-05:

- The four workspace apps (docs, sheets, slides, whiteboard) receive **zero**
  environment variables in either the Ansible role or the GitOps copy, and both
  pin a single moving image tag.
- Exactly one environment is defined anywhere: an overlay named `production`.
  Staging does not partially exist; it does not exist.
- Of those four, three already read their relay through this package's
  `getServiceConfig()`. One (sheets) has its own literal.
- This package itself carries production literals that bypass `getServiceConfig()`
  entirely, so an app could adopt the mechanism and still reach production.

## Requirements

1. **One image, many environments.** The same image must serve production and
   staging, differing only in what it is given at container start.
2. **Production unchanged, by construction.** An image with no runtime
   configuration must behave exactly as it does today. Not "should"; the absence
   of configuration must resolve to the existing build-time value, and failing
   that the existing default.
3. **Configuration is readable before the app runs.** App modules capture URLs
   at import time, so the configuration must be present synchronously before the
   bundle executes. An asynchronous fetch would race and sometimes lose.
4. **A wrong value fails loudly, never silently.** If a runtime value is
   malformed, the mechanism must not substitute the production default.
   Reaching the wrong environment without any error is the failure this exists
   to prevent; an unreachable host is the acceptable lesser failure.
5. **No second configuration path.** The reader resolves runtime, then
   build-time, then default. It does not grow a third source.
6. **The nav catalog is not duplicated.** What services exist stays owned by the
   interface package. Runtime configuration may only override where they live.
7. **Additive and back-compatible.** Existing exports keep their signatures and
   their behaviour, so consumers upgrade through an ordinary minor release.

## Out of scope, and why

- **The staging environment itself.** No document in the tree defines what
  staging is; the only description is a stale template. This work is the
  precondition, not the environment.
- **Three blockers inside the auth and interface packages.** They are already
  recorded as known violations: the auth package force-prepends the production
  relay even when the bunker names others, the interface package pins the
  session cookie to the production domain and suffix-checks it, and its auth
  provider defaults the signer to a literal. Staging will not work until those
  are fixed, and they are owned elsewhere. Routed separately.
- **Apps with no nginx.** One app is served by its own Go binary, so it needs
  the same contract delivered by different means.
- **The desktop shell**, which bundles the built assets and has no container, so
  it keeps the compiled-in defaults.

## Acceptance

- The reader returns today's values when nothing is configured.
- A runtime value overrides a build-time value.
- A malformed runtime value is used and reported, not replaced.
- The same built image, run twice with different environment, is observed in a
  real browser connecting to two different relays.
