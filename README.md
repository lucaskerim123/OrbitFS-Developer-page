# OrbitFS Developer Control Panel

Developer-only control plane for OrbitFS release orchestration.

## System boundary

1. License Authority — lucaskerim123/Custom-licence-manager
2. Billing / Customer Portal — lucaskerim123/V2_Billing_Store
3. Deployment Auto Release System — lucaskerim123/OrbitFS-Developer-page

The existing License Manager and Billing Store are not modified by this repository.

## Base Deployment System

base-release in V1-vercel-base → validate/build/package → existing License Master release API → Billing Store review/publish → customer Base Deployer.

The control workflow in this repository dispatches the existing release-to-license-master.yml workflow in V1-vercel-base.

## Update Release System

UPDATE_RELEASE in V1-vercel-engine → selected APEX/MCP/Studio changes → release analysis → package → existing Store/License release path → Billing Store review/publish → customer update deployer.

The control workflow dispatches the existing publish-engine-release.yml workflow in V1-vercel-engine.

## GitHub App

The Pages frontend never receives credentials. The two control workflows use a GitHub App installation token to dispatch the existing workflows in the source repositories.

Required repository secrets:

- ORBITFS_RELEASE_APP_ID
- ORBITFS_RELEASE_APP_PRIVATE_KEY

Install the GitHub App on V1-vercel-base and V1-vercel-engine with Actions write permission.

This is the first control-plane layer. It does not replace License Master or Billing Store.
