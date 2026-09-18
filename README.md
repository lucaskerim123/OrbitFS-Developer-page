# OrbitFS Developer Control Panel

Developer-only control panel for the existing OrbitFS release workflow.

## What this site does

This repository is the **developer release control surface**. It does not issue, store, validate or enforce customer licenses.

The page gives a simple UI for launching the existing GitHub Actions release jobs and watching their status without having to live on Actions screens.

### Base

`base-release` in `V1-vercel-base` → existing Base control workflow → existing `release-to-license-master.yml` job → validation/build/package → License Master handoff.

### Updates

`UPDATE_RELEASE` in `V1-vercel-engine` → existing Update control workflow → existing `publish-engine-release.yml` job → release analysis/packaging → existing release handoff.

OrbitFS is the product:

- `orbitfs_base` = the OrbitFS base product/license.
- APEX, MCP and Studio = add-ons to that base product.

License Manager remains the authority for licensing, installations and deployment state. Billing Store remains the customer/admin portal and customer deployment/update surface.

## Browser setup

The control page needs a GitHub token because GitHub Pages is static and must not contain a GitHub App private key.

1. Create a fine-grained GitHub token for the developer account with access to this repository and permission to run Actions.
2. Open the Developer Control Panel and use **Setup → Connect & Check**.
3. The token is kept only in this browser session and is sent to GitHub's API.
4. The privileged cross-repository operation is still performed by the existing GitHub App token inside the control workflows.

## GitHub App / Actions setup

The existing control workflows use the Marketplace action:

`actions/create-github-app-token@v2`

Required secrets in this repository:

- `ORBITFS_RELEASE_APP_ID`
- `ORBITFS_RELEASE_APP_PRIVATE_KEY`

The installed GitHub App needs Actions write access to:

- `V1-vercel-base`
- `V1-vercel-engine`

The existing source release jobs remain the execution layer. This repository does not replace them.

## Pages deployment

`.github/workflows/pages-deploy.yml` uses the standard GitHub Pages Marketplace actions to publish `index.html`, `styles.css` and `app.js` on every push to `main`.

## Repository boundary

1. **Custom-licence-manager** — licensing authority, license/install/deployment state and enforcement.
2. **V2_Billing_Store** — customer/admin portal and customer deployment/update experience.
3. **OrbitFS-Developer-page** — developer-only release control UI and Actions orchestration.
