import path from 'node:path'
import type { Hono } from 'hono'
import autoloadRoutes, { filepathToRoute, toPosix, DEFAULT_METHOD, DEFAULT_ROUTES_DIR, type AutoloadRoutesOptions } from 'universal-autorouter'

type App = Hono & {
  hmrRoutes?: Record<string, Function>
  injectHandler?: (method: string, route: string, handler: Function) => void
}

export default async (app: App, options: AutoloadRoutesOptions): Promise<Hono> => {
  const {
    prefix = '',
    defaultMethod = DEFAULT_METHOD,
    routesDir = DEFAULT_ROUTES_DIR,
    viteDevServer
  } = options

  const entryDir = path.isAbsolute(routesDir) ? toPosix(routesDir) : path.posix.join(process.cwd(), routesDir)

  // Middleware to dynamically dispatch requests to updated handlers
  // Should be registered before autoloading routes
  app.use(`${prefix}/*`, async (c, next) => {
    const { incoming: { method, url } } = c.env as { incoming: { method: string, url: string } }
    const handler = app.hmrRoutes![`${method}${url}`]
    if (handler) {
      return await handler(c) // Invoke the dynamic handler if found
    }
    await next()  // Proceed to the next middleware or static route if no dynamic handler is matched
  })

  // Automatically load and register initial routes from the specified directory
  await autoloadRoutes(app, options)

  app.hmrRoutes = {}

  // Add a method to dynamically inject or replace route handlers
  app.injectHandler = function (method: string, route: string, handler: Function) {
    // Store the handler for dynamic dispatch
    app.hmrRoutes![`${method.toUpperCase()}${route}`] = handler
  }

  // Listen for changes in route files during development
  viteDevServer!.watcher.on('change', async (file: string) => {
    if (toPosix(file).startsWith(entryDir)) {
      const { default: handler } = await viteDevServer!.ssrLoadModule(file, { fixStacktrace: true })
      const posixFilepath = toPosix(file)
      const relativeFilepath = posixFilepath.replace(toPosix(entryDir), '')
      const matchedFile = relativeFilepath.match(/\/?\((.*?)\)/)
      const method = matchedFile ? matchedFile[1] : defaultMethod
      const route = `${prefix}${filepathToRoute(relativeFilepath)}`
      // Update or re-register the route with the new handler
      app.injectHandler!(method, route, handler)
    }
  })

  return app
}
