import type { AdminCapabilities } from "@effect-admin/contracts"
import { validateAdminResources, type AdminResourceDef } from "@effect-admin/core"
import type * as HttpApi from "@effect/platform/HttpApi"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { AdminClient } from "./client.js"
import { defaultComponents, type EffectAdminComponents } from "./components.js"
import type { EffectAdminClientOptions } from "./default-client.js"
import { ErrorState, failureOf, Loading, type Failure } from "./internal.js"
import { matchAdminRoute, useAdminLocation } from "./router.js"
import { Home, ListScreen, RecordScreen } from "./screens.js"

export interface EffectAdminProps {
  readonly api?: HttpApi.HttpApi.Any
  readonly resources: ReadonlyArray<AdminResourceDef>
  readonly basePath?: string | undefined
  readonly baseUrl?: string | undefined
  readonly pageSize?: number | undefined
  readonly clientOptions?: EffectAdminClientOptions | undefined
  readonly client?: AdminClient | undefined
  readonly capabilities?: AdminCapabilities | undefined
  readonly loadCapabilities?: (() => AdminCapabilities | PromiseLike<AdminCapabilities>) | undefined
  readonly components?: Partial<EffectAdminComponents> | undefined
}

export const EffectAdmin = ({
  api,
  resources,
  basePath = "/admin",
  baseUrl = "",
  pageSize = 25,
  clientOptions,
  client: providedClient,
  capabilities,
  loadCapabilities,
  components
}: EffectAdminProps) => {
  const validatedResources = useMemo(() => {
    validateAdminResources(resources)
    return resources
  }, [resources])
  const location = useAdminLocation(basePath)
  const route = matchAdminRoute(location, basePath)
  const slots = { ...defaultComponents, ...components }
  const [client, setClient] = useState<AdminClient | undefined>(providedClient)
  const [loadedCapabilities, setLoadedCapabilities] = useState<AdminCapabilities | undefined>()
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(loadCapabilities !== undefined)
  const [failure, setFailure] = useState<Failure>()

  useEffect(() => {
    if (providedClient) { setClient(providedClient); return }
    if (!api) { setFailure({ message: "EffectAdmin requires either an HttpApi or a client." }); return }
    let active = true
    import("./default-client.js").then(({ makeDefaultAdminClient }) =>
      makeDefaultAdminClient(api, { ...clientOptions, baseUrl })
    ).then(
      (value) => { if (active) setClient(value) },
      (error) => { if (active) setFailure(failureOf(error)) }
    )
    return () => { active = false }
  }, [api, baseUrl, clientOptions, providedClient])

  useEffect(() => {
    if (!loadCapabilities) {
      setLoadedCapabilities(undefined)
      setCapabilitiesLoading(false)
      return
    }
    let active = true
    setCapabilitiesLoading(true)
    setFailure(undefined)
    Promise.resolve(loadCapabilities()).then(
      (value) => {
        if (active) {
          setLoadedCapabilities(value)
          setCapabilitiesLoading(false)
        }
      },
      (error) => {
        if (active) {
          setFailure(failureOf(error))
          setCapabilitiesLoading(false)
        }
      }
    )
    return () => { active = false }
  }, [loadCapabilities])

  const effectiveCapabilities = loadedCapabilities ?? capabilities
  const resource = validatedResources.find((item) => item.name === route.resource)
  let content: ReactNode
  if (failure) content = <ErrorState failure={failure} />
  else if (!client || capabilitiesLoading) content = <Loading />
  else if (route.screen === "home") content = <Home resources={validatedResources} basePath={basePath} />
  else if (!resource) content = <div className="ea-state">Resource not found.</div>
  else if (route.screen === "list") content = <ListScreen {...{
    client, resource, basePath, location, pageSize, capabilities: effectiveCapabilities, DataTable: slots.DataTable
  }} />
  else if (route.screen === "create" || route.screen === "detail" || route.screen === "edit") {
    content = <RecordScreen
      client={client}
      resources={validatedResources}
      resource={resource}
      basePath={basePath}
      mode={route.screen}
      capabilities={effectiveCapabilities}
      TextInput={slots.TextInput}
      {...(route.id !== undefined ? { id: route.id } : {})}
    />
  } else content = <div className="ea-state">Page not found.</div>

  return <slots.Layout
    basePath={basePath}
    resources={validatedResources}
    {...(resource ? { currentResource: resource.name } : {})}
  >{content}</slots.Layout>
}
