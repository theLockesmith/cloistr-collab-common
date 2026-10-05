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

## The proof app (sheets)

Chosen because it is the leanest app that genuinely bakes hostnames in, and it
exercises both the relay and the file host. Its sibling (slides) is simpler but
only exercises the file host.

- [ ] Replace its own relay literal with the shared reader, matching what the
      other three already do.
- [ ] Turn its nginx config into a template with the configuration location.
- [ ] Add the script tag to `index.html` before the bundle.
- [ ] Serving-stage environment lines carrying production values, plus the
      substitution filter.
- [ ] Build once; run the same image twice with different environment; observe
      two different relay URLs in a real browser.

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
