# Runtime service configuration — tasks

Every ticked item carries its evidence inline. A tick on its own is a claim, not
a result. The raw output each one refers to is in the Evidence section at the
bottom.

## This package

- [x] Test the reader first, red before green.
      (verified: 26 failed before the implementation existed, 26 passed after)
- [x] Add the runtime tier to the service-config module: the runtime type, the
      global's name as a pinned constant, a signer default that was missing, the
      resolution order, scheme checking that reports without falling back, and a
      cache reset for tests.
      (tested: 26 tests in src/config/runtime-config.test.ts, all passing)
- [x] Route this package's own bare production defaults through the reader, so
      an app cannot adopt the mechanism and still reach production: the
      relay-preference defaults (discovery host and default relay), and the
      sharing link base used when there is no browser.
      (tested: 6 tests in src/relay/relay-prefs-defaults.test.ts, all passing,
      red first with "_defaultRelayPrefsConfig is not a function")
- [x] Bump the minor version by hand, 0.3.0 to 0.4.0. Publishing is manual and
      the version bump is not automated; without it the publish job goes green
      and ships nothing.
      (verified: package.json diff shows 0.3.0 to 0.4.0 in the staged change)
- [x] Whole suite does not regress.
      (verified: 74 passing on this branch against 42 on a pristine worktree of
      origin/master, same 14 pre-existing failures in the same two files)

## The proof

Originally planned inside the leanest app that genuinely bakes hostnames in.
That app's tree belongs to another role, and the lane guard was right to refuse
it: a change made around the owner lands with nobody who knows it is there. The
mechanism does not need their tree to be proven, so the proof was built
standalone instead.

- [x] Real serving base image, the same unprivileged nginx image every frontend
      uses.
      (verified: image inspected directly, startup scripts and substitution tool
      both present, runtime user owns the output directory)
- [x] The base image's own startup substitution, no custom entrypoint and no
      script of ours.
      (verified: the base image's template step honours a name filter, read out
      of the image itself)
- [x] The freshly compiled reader from this package, copied in unmodified.
      (verified: the new constant appears once in the fresh build and zero times
      in the month-old artifact on disk, which is what proves the harness tests
      new code)
- [x] The same one-year immutable cache rule the real apps have, kept so the
      exact-match location precedence is tested rather than assumed.
      (tested: sibling script returns max-age=31536000, public, immutable)
- [x] Build once; run the same image twice with different environment; two
      different relay URLs observed in real Chromium.
      (verified: both containers report the same image fingerprint; readings are
      wss://relay.cloistr.xyz and wss://relay.staging.cloistr.xyz)
- [x] The no-environment run still reports the production relay. This is the
      assertion protecting the live service.
      (verified: no environment given yields the production relay and
      environment "production")
- [x] A control, so the no-store assertion is not vacuous.
      (tested: /config.js returns no-store while a sibling script returns a
      one-year immutable cache in the same container)

## Where this landed

Branch `feat/runtime-config`, pushed, merge request open.
(see merge request 57 on cloistr-collab-common)

Publishing happens on merge to the default branch, and governance requires one
non-author review, so the package version is not live until someone reviews it.
That review is the only thing between this and adoptable.

## Delivery

- [ ] Per-environment settings object holding the URLs, and a reference to it
      from the deployment, so the deployment itself is identical across
      environments and only the settings differ.
- [ ] Keep the Ansible role and the GitOps copy in agreement. Where both set the
      same value and disagree, they revert each other indefinitely.

## Adoption

- [x] Short adoption steps, written from the proof rather than from the plan.
      (see docs/runtime-config-adoption.md, six steps, with both silent-failure
      traps called out)
- [ ] Adopt in docs, sheets, slides, whiteboard. NOT this session's work: those
      four trees belong to other roles, the lane guard refused the writes, and
      the orchestrator confirmed it will route the per-app conversions rather
      than have the guard overridden.

## Routed elsewhere, not blocking this

All five are staging blockers owned by whoever owns the shared packages, and all
five are listed in the staging environment definition.

- [ ] The auth package force-prepends the production relay even when the bunker
      names other relays.
- [ ] The interface package pins the session cookie to the production parent
      domain and suffix-checks that domain, with no override.
- [ ] Its shared auth provider defaults the signer to a literal.
- [ ] The nav catalog accepts a base-domain argument and ignores it, so
      cross-app links stay on production.
- [ ] A staging host inside the production parent domain shares the session
      cookie with production. Separating the hostnames does not separate the
      sessions.

## Evidence

Raw output behind the ticks above.

**Red before green, the reader.** Written first, run first, watched to fail
before any implementation existed:

```
npx vitest run src/config/runtime-config.test.ts
  Test Files  1 failed (1)
       Tests  26 failed (26)
```

Then, once the runtime tier existed, the same command:

```
  Test Files  1 passed (1)
       Tests  26 passed (26)
```

**Red before green, the library's own defaults.** Same order, and the failure
was specifically the missing function rather than a wrong value, which is what
makes it a real red:

```
npx vitest run src/relay/relay-prefs-defaults.test.ts
  TypeError: _defaultRelayPrefsConfig is not a function   (x6)
  Test Files  1 failed (1)
```

Then green, 6 passed.

**The whole suite on this branch:**

```
npx vitest run
  Test Files  2 failed | 8 passed (10)
       Tests  14 failed | 74 passed (88)
```

The 14 failures are in two files this branch does not touch. That they predate
the branch is measured, not assumed: the same command in a pristine worktree of
the default branch gives

```
  Test Files  2 failed | 6 passed (8)
       Tests  14 failed | 42 passed (56)
```

Same 14, same two files, 42 passing instead of 74.

**Version bump,** visible in the staged diff rather than asserted:

```
package.json | 2 +-
-  "version": "0.3.0",
+  "version": "0.4.0",
```

**End-to-end proof,** one image run twice, read out of real Chromium:

```
no environment given  -> wss://relay.cloistr.xyz          environment: production
environment set       -> wss://relay.staging.cloistr.xyz  environment: staging
/config.js            -> cache-control: no-store                    (both)
/main.js  (control)   -> cache-control: max-age=31536000, public, immutable
ALL ASSERTIONS PASSED
```

Both containers reported the same image fingerprint, so this is one image and
not two builds. The control line is what makes the no-store line mean anything:
without it, no-store would also pass if the hard-caching rule were simply
absent, proving nothing about which location wins.

**A caveat on that proof, worth keeping.** The reader it exercises had to be
compiled to a writable directory first. The checked-out output directory in this
repo is root-owned on that workstation, so an ordinary build cannot write it and
silently leaves a month-old file in place. The stale file did not contain the new
constant (a count returned 0); the freshly compiled one did (returned 1).
Testing the stale file would have produced a confidently passing proof of code
from before the change. Piping the build through a filter also made the shell
report success for a build that had failed, so read the build's own status, not
the filter's.

**No prior art to reuse.** A search of logged learnings and decisions turns up
nothing on runtime-configured frontends, on one image serving several
environments, or on an abandoned attempt at either. The closest hits are
verification lessons rather than design: that grepping a served bundle can
report a correctly deployed fix as missing, and that a test harness serving the
source tree instead of the build fails in a way indistinguishable from stale
selectors. Both argue for exactly the shape of proof used here, a real browser
against a real built image, carrying a control.
