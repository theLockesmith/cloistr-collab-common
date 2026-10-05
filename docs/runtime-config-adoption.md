# Adopting runtime service configuration

How to make one image serve production and staging. Written from a working
proof, not from a plan.

The reasoning, the measurements and the rejected alternatives are in
`specs/runtime-config/`. This file is the recipe.

## Already proven, not just proposed

Measured 2026-10-05, in a real browser against one locally built image run
twice:

| | no environment given | environment set |
|---|---|---|
| relay the app uses | `wss://relay.cloistr.xyz` | `wss://relay.staging.cloistr.xyz` |
| environment reported | `production` | `staging` |
| configuration response | `no-store` | `no-store` |
| sibling script response | `max-age=31536000, public, immutable` | same |

Both containers ran the same image id. The last row is the control: it shows the
one-year caching rule genuinely is in force, which is what makes the `no-store`
on the row above it meaningful rather than vacuous.

The proof harness is in this session's working area, not in any app's tree, and
its README says how to re-run it.

## What you get

The app reads its relay, signer, file host and discovery host from
configuration the container produces at startup, instead of from values frozen
into the bundle when the image was built. An image given no configuration
behaves exactly as it does today, so adopting this is not a behavioural change
for a live service.

## What it costs you

Four small edits, no new dependency (the reader is already in this package, and
three of the four workspace apps already call it), and no custom startup script.

## Step 1 — read config through the shared reader

Replace any local literal or direct environment read:

```ts
// before
const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL || 'wss://relay.cloistr.xyz'

// after
import { getServiceConfig } from '@cloistr/collab-common/config'
const { relayUrl } = getServiceConfig()
```

The reader resolves each value in this order: configuration written at container
start, then the build-time environment variable, then the default. Runtime wins
because the image is built once and run in more than one place.

A malformed runtime value is reported to the console and then **used**, not
replaced by the default. That is deliberate. Falling back would mean one typo in
a staging deployment quietly talking to production, and a host that cannot
connect is a failure you can see.

## Step 2 — rename the serving config to a template and add one location

Move `nginx.conf` to `nginx.conf.template` and add:

```nginx
location = /config.js {
    access_log off;
    default_type application/javascript;
    add_header Cache-Control "no-store" always;
    return 200 'window.__CLOISTR_CONFIG__={"relayUrl":"${CLOISTR_RELAY_URL}","blossomUrl":"${CLOISTR_BLOSSOM_URL}","discoveryUrl":"${CLOISTR_DISCOVERY_URL}","signerUrl":"${CLOISTR_SIGNER_URL}","appUrl":"${CLOISTR_APP_URL}","environment":"${CLOISTR_ENVIRONMENT}"};';
}
```

Two details are load-bearing, and both bite silently if you get them wrong:

- **`location =`, an exact match.** Every app's config gives anything ending in
  the script extension a one-year immutable cache via a regex location. An exact
  match outranks a regex match; a prefix match does not. With a prefix match a
  browser caches the configuration for a year and keeps using whichever
  environment it saw first.
- **`no-store`.** Same failure one layer out, at an edge cache, serving one
  environment's configuration to the other.

If your app proxies another service from nginx with a hardcoded host, template
that host too. Substitution happens before nginx parses the file, so the result
is a literal and needs no resolver directive, which it would if it were an nginx
runtime variable.

## Step 3 — load it before the bundle

In `index.html`, above the existing module script:

```html
<script src="/config.js"></script>
<script type="module" src="/src/main.tsx"></script>
```

A script tag, not a fetch. Modules capture these URLs when they are imported, so
an asynchronous fetch would race and sometimes lose.

In a dev server there is no such file and the tag 404s harmlessly; the reader
falls back to the dev environment variables exactly as before.

## Step 4 — serving stage carries production defaults

```dockerfile
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV CLOISTR_RELAY_URL=wss://relay.cloistr.xyz \
    CLOISTR_SIGNER_URL=https://signer.cloistr.xyz \
    CLOISTR_BLOSSOM_URL=https://files.cloistr.xyz \
    CLOISTR_DISCOVERY_URL=https://discover.cloistr.xyz \
    CLOISTR_APP_URL=https://<this app>.cloistr.xyz \
    CLOISTR_ENVIRONMENT=production \
    NGINX_ENVSUBST_FILTER=^CLOISTR_
```

- The base image runs the substitution step itself, before nginx starts. There
  is nothing to add to the entrypoint and no script to maintain.
- **Production values as defaults is what makes production unchanged.** Unset in
  the deployment resolves to production, structurally.
- **The filter is not optional.** Without it the substitution tool replaces every
  `$NAME` it recognises as a defined variable, and the config contains nginx's
  own names such as `$uri`.
- Keep the existing build arguments. They are what makes the no-configuration
  case resolve to production for values the bundle reads directly.

## Step 5 — supply staging values at deploy time

Put the URLs in a per-environment settings object and reference it from the
container, so the deployment itself is identical in both environments and only
the settings differ. Where the automation and the GitOps copy both set the same
value, they must agree, or they revert each other indefinitely.

## Step 6 — prove it, do not assert it

Build once, run twice, look with a real browser:

```bash
docker build -t myapp:rc .
docker run -d -p 8081:8080 --name prod-like myapp:rc
docker run -d -p 8082:8080 --name staging-like \
  -e CLOISTR_RELAY_URL=wss://relay.staging.cloistr.xyz \
  -e CLOISTR_ENVIRONMENT=staging myapp:rc
```

Then confirm the running app reports two different relay URLs. Not two different
files on disk and not two different command-line responses: the URL the app
actually uses. The fleet's smoke gate already starts a built image and drives
real Chromium, and that gate exists because an app once compiled green and
rendered a blank page.

Also run the no-environment case and confirm it still reports production. That
is the test that protects the live service.

## Known gaps that this does not fix

Staging is not usable until these are closed, and none of them is in this
package:

1. The auth package prepends the production relay to NIP-46 traffic even when
   the bunker names other relays.
2. The interface package pins the session cookie to the production parent domain
   and suffix-checks it, with no override.
3. Its shared auth provider defaults the signer to a literal.
4. The nav catalog accepts a base-domain argument and ignores it, so cross-app
   links stay on production.
5. A staging host *inside* the production parent domain means the session cookie
   is sent to both environments. Separating the hostnames does not separate the
   sessions.

Items 1 to 3 are already recorded as known violations in the unified auth
design; nobody has fixed them. All five are routed to the owners of the shared
packages, and all five are listed as staging blockers in the staging
environment definition (`architecture/staging-environment.md` in the Cloistr
docs tree), which also names the owner of each.

Item 5 is the one most likely to be waved away. Separating the hostnames does
not separate the sessions: the staging hostnames sit inside the production
parent domain, so a cookie scoped to the parent is sent to both. Staging needs
its own cookie name, or a cookie scoped to the staging parent.

## Apps that need a different delivery

- One app is served by its own Go binary rather than nginx, so it must serve the
  same configuration contract from that binary.
- The desktop shell bundles the built assets and has no container, so it keeps
  the compiled-in defaults.
- One app has no build stage in its image at all; its bundle is built earlier and
  copied in. The serving half of this recipe still applies unchanged.
