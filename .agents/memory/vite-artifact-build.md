---
name: Vite artifact build environment
description: Environment variables required when building this web artifact outside its configured workflow.
---

Set both `PORT` and `BASE_PATH` from the artifact metadata when running a production Vite build directly. Providing only `PORT` still fails because the Vite config also requires `BASE_PATH`.

**Why:** Direct builds failed until both configured values were passed.

**How to apply:** Read the current artifact metadata first, then pass its service port and base path to the build command.
