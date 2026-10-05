# Runtime service configuration — tasks

## This package

- [x] Test the reader first, red before green.
- [x] Add the runtime tier to the service-config module: the runtime type, the
      global's name as a pinned constant, a signer default that was missing, the
      resolution order, scheme checking that reports without falling back, and a
      cache reset for tests. 26 tests.
- [x] Route this package's own bare production defaults through the reader, so
      an app cannot adopt the mechanism and still reach production:
      - relay-preferences defaults (discovery host and default relay), 6 tests
      - the sharing link base used when there is no browser
- [x] Bump the minor version by hand, 0.3.0 to 0.4.0. Publishing is manual and
      the version bump is not automated; without it the publish job goes green
      and ships nothing.
- [x] Suite: 74 passing, up from 42. The 14 failures in two other files predate
      this branch, verified against a pristine copy of the default branch.

## The proof

Originally planned inside the leanest app that genuinely bakes hostnames in.
That app's tree belongs to another role, and the lane guard was right to refuse
it: a change made around the owner lands with nobody who knows it is there. The
mechanism does not need their tree to be proven, so the proof was built
standalone instead.

- [x] Real serving base image, the same unprivileged nginx image every frontend
      uses.
- [x] The base image's own startup substitution, no custom entrypoint and no
      script of ours.
- [x] The freshly compiled reader from this package, copied in unmodified. Worth
      noting: the checked-out output directory here is root-owned locally, so an
      ordinary build cannot write it and leaves a month-old file behind. Testing
      that file would have tested code from before this change.
- [x] The same one-year immutable cache rule the real apps have, so the
      exact-match location precedence is tested rather than assumed.
- [x] Build once; run the same image twice with different environment; two
      different relay URLs observed in real Chromium. Same image id both times.
- [x] The no-environment run still reports the production relay. That is the
      assertion protecting the live service.
- [x] A control, so the no-store assertion is not vacuous: a sibling script is
      served with a one-year immutable cache, proving the rule the exact-match
      location has to outrank is genuinely in force.

## Where this landed

Branch `feat/runtime-config`, pushed. Publishing happens on merge to the
default branch, and governance requires one non-author review, so the package
version is not live until someone reviews it. That review is the only thing
between this and adoptable.

## Delivery

- [ ] Per-environment settings object holding the URLs, and a reference to it
      from the deployment, so the deployment itself is identical across
      environments and only the settings differ.
- [ ] Keep the Ansible role and the GitOps copy in agreement. Where both set the
      same value and disagree, they revert each other indefinitely.

## Adoption

- [ ] Short adoption steps, written from the proof rather than from the plan.
- [ ] Adopt in docs, sheets, slides, whiteboard. These four have no live owners
      and must move to staging.

## Routed elsewhere, not blocking this

- [ ] The auth package force-prepends the production relay even when the bunker
      names other relays.
- [ ] The interface package pins the session cookie to the production domain and
      suffix-checks that domain, with no override.
- [ ] Its auth provider defaults the signer to a literal.
- [ ] The nav catalog ignores the base-domain argument it already accepts, so
      cross-app links stay on production.
