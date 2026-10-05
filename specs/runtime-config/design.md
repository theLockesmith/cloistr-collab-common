# Runtime service configuration — design

## The mechanism

The serving image is the unprivileged nginx image. That image already runs every
script in its startup directory before nginx starts, and one of those scripts
substitutes environment variables into any file under its template directory,
writing the result into the active config directory. No app in the fleet uses
this today.

Verified in the image on 2026-10-05: the startup directory holds four scripts
including the substitution one, the substitution tool is present, the runtime
user owns the output directory, and the substitution honours a filter so only
chosen variable names are considered.

So the app's nginx config becomes a template, and nginx returns the
configuration directly from its own config:

```nginx
location = /config.js {
    default_type application/javascript;
    add_header Cache-Control "no-store" always;
    return 200 'window.__CLOISTR_CONFIG__={"relayUrl":"${CLOISTR_RELAY_URL}","signerUrl":"${CLOISTR_SIGNER_URL}","blossomUrl":"${CLOISTR_BLOSSOM_URL}","discoveryUrl":"${CLOISTR_DISCOVERY_URL}","appUrl":"${CLOISTR_APP_URL}","environment":"${CLOISTR_ENVIRONMENT}"};';
}
```

`index.html` loads it before the bundle:

```html
<script src="/config.js"></script>
<script type="module" src="/src/main.tsx"></script>
```

### Why this shape

- **No custom shell script.** Nothing to write, review or maintain, and nothing
  that can fail silently at startup.
- **No file written at runtime.** The image deliberately runs as a non-root
  user, and the web root is not writable by it. Returning the body from the
  nginx config means nothing needs to be written anywhere, so no ownership
  change and no writable directory are introduced into a hardened image.
- **A script tag, not a fetch.** Synchronous and ordered, so the configuration
  is present before any module runs. A fetch would race against import-time
  reads.
- **Defaults are plain environment lines in the serving stage, holding
  production values.** Unset therefore means production. That is what makes
  requirement 2 structural rather than aspirational.
- **No caching on the configuration.** Without that header a browser or an edge
  cache can serve one environment's configuration to the other.
- **The substitution filter is restricted to our own prefix.** The substitution
  tool replaces any `$NAME` it recognises as a defined variable, and an nginx
  config is full of its own `$` names. Restricting the filter keeps it to ours.

### Why the proxy case still works

Two apps proxy the signer from nginx with a hardcoded host. Substitution happens
before nginx parses its config, so the host becomes a literal and needs no
resolver directive. Templating that host is therefore safe, which it would not
be if it were an nginx runtime variable.

## The reader

Resolution order per field, highest first: runtime, then build-time environment,
then default. Runtime wins because the image is built once with production
values compiled in and then run in more than one environment.

Malformed values are reported and then used. The alternative, falling back,
converts a visible failure into an invisible one: a staging deployment with one
typo would quietly use production. The error names the field and the expected
scheme, and fires once per field rather than once per read.

A non-string, or an empty string, counts as absent and falls through. An empty
string matters specifically because the substitution tool writes an empty string
for a variable that is not set, so "unset" and "set to nothing" arrive looking
identical and must both mean "use the build-time value".

The global's name is exported as a constant and pinned by a test, because the
template that writes it and the reader that consumes it live in different repos
and cannot otherwise be kept in agreement.

## What this does not solve

The library's own production literals outside this module, and the three
blockers in the auth and interface packages. Those are tracked in the
requirements as out of scope with the reason.
