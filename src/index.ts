import path from 'node:path'
import type { Hono } from 'hono'
import autoloadRoutes, { filepathToRoute, toPosix, DEFAULT_METHOD, DEFAULT_ROUTES_DIR, type AutoloadRoutesOptions } from 'universal-autorouter'

type App = Hono & {
  hmrRoutes?: Record<string, Function>
  injectHandler?: (method: string, route: string, handler: Function) => void
}

export default async (app: App, options: AutoloadRoutesOptions & {
  externalDirs?: string[]
}): Promise<Hono> => {
  const {
    prefix = '',
    defaultMethod = DEFAULT_METHOD,
    routesDir = DEFAULT_ROUTES_DIR,
    viteDevServer,
    externalDirs
  } = options

  const entryDir = path.isAbsolute(routesDir) ? toPosix(routesDir) : path.posix.join(process.cwd(), routesDir)

  // Middleware to dynamically dispatch requests to updated handlers
  // Should be registered before autoloading routes
  app.use(`${prefix}/*`, async (c, next) => {
    const { incoming: { method, url } } = c.env as { incoming: { method: string, url: string } }
    const handler = app.hmrRoutes![`${method}${url.split('?')[0]}`]
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

  const updateHandler = async (filepath: string) => {
    const { default: handler } = await viteDevServer!.ssrLoadModule(filepath, { fixStacktrace: true })
    const relativeFilepath = filepath.replace(entryDir, '')
    const matchedFile = relativeFilepath.match(/\/?\((.*?)\)/)
    const method = matchedFile ? matchedFile[1] : defaultMethod
    const route = `${prefix}${filepathToRoute(relativeFilepath)}`
    // Update (re-register) the route with the new handler
    app.injectHandler!(method, route, handler)
  }

  const externalDirsPaths = externalDirs?.map((dir) => path.isAbsolute(dir) ? toPosix(dir) : path.posix.join(process.cwd(), dir))

  const updateExternal = async (filepath: string) => {
    if (externalDirsPaths && !externalDirsPaths.some((dir) => filepath.startsWith(dir))) {
      return
    }
    const dependentModules = viteDevServer!.moduleGraph.getModulesByFile(filepath) || []
    for (const mod of dependentModules) {
      for (const importer of mod.importers) {
        const importerFile = importer.file
        if (importerFile) {
          await (importerFile.startsWith(entryDir)
            // Route file
            ? updateHandler(importerFile)
            // External file imported by route file
            : updateExternal(importerFile))
        }
      }
    }
  }

  const log = (type: string, filepath: string) => {
    viteDevServer!.config.logger.info(`\u001B[2m${new Date().toLocaleTimeString()
      }\u001B[22m \u001B[36m[autorouter]\u001B[39m \u001B[32mHMR update ${type
      }\u001B[39m \u001B[2m${filepath.replace(viteDevServer!.config.root, '.')}\u001B[22m`)
  }

  // Listen for changes in route files
  viteDevServer!.watcher.on('change', async (file: string) => {
    const filepath = toPosix(file)
    if (filepath.startsWith(entryDir)) {
      // Route file
      await updateHandler(filepath)
      log('route', filepath)
    } else {
      // Handle changes to external files imported by the route files
      await updateExternal(filepath)
      log('file', filepath)
    }
  })

  return app
}
