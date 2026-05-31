<p align="center">
  <img src="public/brand/huginum-cortex-light.svg" alt="Huginum Cortex" width="520">
</p>

# Huginum Cortex - Local Agentic Development Platform

Cortex is Huginum's local agentic development platform.

The first implementation is a standalone desktop terminal built with Tauri, React, and libghostty-vt. It establishes the local terminal foundation Cortex will build on for agentic development workflows.

## Development

```sh
npm install
npm run tauri:dev
```

## Checks

```sh
npm run build
npm run ghostty:verify
npm run docs:build
```

Brand assets live in `public/brand/` for the app and `docs/modules/user/assets/images/brand/` for Antora.
