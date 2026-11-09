# CaddieCard release rule

Before every publish to GitHub, create a new release version and keep all three release markers synchronized:

- `APP_VERSION` in `app.js`
- `version` in `version.json`
- the `app.js?v=` cache-busting value in `index.html`

Never publish user-facing code changes without updating these markers. Before pushing, verify that the first two version strings match and that the cache-busting value changed from the previous commit.
