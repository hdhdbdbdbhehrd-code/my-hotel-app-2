// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Detect whether we're building inside the Lovable preview sandbox.
// Inside the sandbox we keep the default deployment bundling so the live
// preview keeps working. Anywhere else (e.g. your machine in VS Code or on
// Vercel's build infrastructure) we bundle with Nitro's Vercel preset, which
// emits the `.vercel/output` Build Output API directory Vercel deploys from.
const isLovableSandbox =
  Boolean(process.env.DEV_SERVER__PROJECT_PATH) || Boolean(process.env.LOVABLE_SANDBOX);

export default defineConfig({
  // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
  tanstackStart: {
    server: { entry: "server" },
  },
  // Outside the Lovable sandbox: build for Vercel (no Cloudflare bundling).
  // The config wrapper otherwise forces the Nitro output into `dist/`, which
  // breaks Vercel's Build Output API. We restore the Vercel preset's own
  // `.vercel/output` layout so `vercel deploy` / Vercel's build picks it up.
  ...(isLovableSandbox
    ? {}
    : {
        nitro: {
          preset: "vercel",
          output: {
            dir: "{{ rootDir }}/.vercel/output",
            serverDir: "{{ output.dir }}/functions/__server.func",
            publicDir: "{{ output.dir }}/static/{{ baseURL }}",
          },
        },
      }),
});
