# universal-autorouter-hono

An plugin for [Hono](https://hono.dev) to add HMR (Hot Module Replacement) to Hono routes development.

Package required:
- [universal-autorouter](https://github.com/node-ecosystem/universal-autorouter), used under the hood to autoload routes
- [Vite](https://vite.dev), needed for _ViteDevServer instance_

## ⚙️ Install

```sh
yarn add -D universal-autorouter-hono
```

## 📖 Usage

### Register the Plugin

```ts
// /app.ts
import path from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { AutoloadRoutesOptions } from 'universal-autorouter'

const app = new Hono()

let autoloadRoutes
// Options of "universal-autorouter" or "universal-autorouter-hono" package
const autoloadRoutesOptions: AutoloadRoutesOptions = {
  // Pattern to scan route files
  pattern: '**/*.ts',
  // Prefix to add to routes
  prefix: '/api',
  // Source directory for route handler files
  routesDir: path.resolve(import.meta.dirname, 'api'),
  // Directories for files used by route handler files (as default scan all files)
  externalDirs: ['utils']
}
if (process.env.NODE_ENV === 'production') {
  ({ default: autoloadRoutes } = await import('universal-autorouter'))
  autoloadRoutesOptions.pattern = '**/*.mjs'
} else {
  ({ default: autoloadRoutes } = await import('universal-autorouter-hono'))
  autoloadRoutesOptions.pattern = '**/*.ts'
  autoloadRoutesOptions.viteDevServer = '<ViteDevServer_INSTANCE>'
  // Example with Vike package
  // autoloadRoutesOptions.viteDevServer = globalThis.__vikeNode!.viteDevServer
}

await autoloadRoutes(app, autoloadRoutesOptions)

const port = +(process.env.PORT || 3000)

serve({
  fetch: app.fetch,
  port
}, () => console.log(`Server running at http://localhost:${port}`))
```

## License

This project is licensed under the [MIT License](LICENSE).
