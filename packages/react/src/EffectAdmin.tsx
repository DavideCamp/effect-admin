import {
  validateAdminResources,
  type AdminCapabilitiesValue as AdminCapabilities,
  type AdminResourceDef
} from "@effect-admin/shared"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { AdminClient } from "./client.js"
import { defaultComponents, type EffectAdminComponents } from "./components.js"
import { ErrorState, failureOf, Loading, type Failure } from "./internal.js"
import { matchAdminRoute, useAdminLocation } from "./router.js"
import { Home, ListScreen, RecordScreen } from "./screens.js"

export interface AdminClientFactoryOptions {
  readonly baseUrl?: string | undefined
}

export type AdminClientFactory<Api, Options = object> = (
  api: Api,
  options: Options & AdminClientFactoryOptions
) => Promise<AdminClient>

export interface EffectAdminProps<Api = unknown, ClientOptions = object> {
  readonly api?: Api
  readonly resources: ReadonlyArray<AdminResourceDef>
  readonly basePath?: string | undefined
  readonly baseUrl?: string | undefined
  readonly pageSize?: number | undefined
  readonly clientOptions?: ClientOptions | undefined
  readonly makeClient?: AdminClientFactory<Api, ClientOptions> | undefined
  readonly client?: AdminClient | undefined
  readonly capabilities?: AdminCapabilities | undefined
  readonly loadCapabilities?: (() => AdminCapabilities | PromiseLike<AdminCapabilities>) | undefined
  readonly components?: Partial<EffectAdminComponents> | undefined
}

type ResourceValidation =
  | { readonly resources: ReadonlyArray<AdminResourceDef>; readonly failure?: undefined }
  | { readonly resources: ReadonlyArray<AdminResourceDef>; readonly failure: Failure }

const resourceKey = (resources: ReadonlyArray<AdminResourceDef>): string =>
  resources.map((resource) => [
    resource.name,
    resource.groupName,
    resource.primaryKey,
    resource.fields.map((field) => [
      field.name,
      field.kind,
      field.hidden,
      field.readOnly,
      field.sensitive,
      field.relation?.resource,
      field.relation?.displayField
    ].join(":")).join(","),
    resource.listColumns.join(","),
    Object.keys(resource.fieldConfig).sort().map((key) =>
      `${key}:${JSON.stringify(resource.fieldConfig[key])}`
    ).join(","),
    Object.keys(resource.operations).sort().map((key) =>
      `${key}:${resource.operations[key as keyof typeof resource.operations]}`
    ).join(","),
    Object.keys(resource.actions).sort().map((key) =>
      `${key}:${resource.actions[key]?.endpoint}`
    ).join(",")
  ].join("|")).join("||")

export const EffectAdmin = <Api, ClientOptions = object>({
  api,
  resources,
  basePath = "/admin",
  baseUrl = "",
  pageSize = 25,
  clientOptions,
  makeClient,
  client: providedClient,
  capabilities,
  loadCapabilities,
  components
}: EffectAdminProps<Api, ClientOptions>) => {
  const resourcesKey = resourceKey(resources)
  const validationRef = useRef<{ readonly key: string; readonly value: ResourceValidation } | undefined>(undefined)
  if (validationRef.current?.key !== resourcesKey) {
    validationRef.current = {
      key: resourcesKey,
      value: (() => {
        try {
          validateAdminResources(resources)
          return { resources }
        } catch (error) {
          return { resources, failure: failureOf(error) }
        }
      })()
    }
  }
  const { resources: validatedResources, failure: validationFailure } = validationRef.current.value
  const location = useAdminLocation(basePath)
  const route = matchAdminRoute(location, basePath)
  const slots = { ...defaultComponents, ...components }
  const [client, setClient] = useState<AdminClient | undefined>(providedClient)
  const [loadedCapabilities, setLoadedCapabilities] = useState<AdminCapabilities | undefined>()
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(loadCapabilities !== undefined)
  const [failure, setFailure] = useState<Failure>()
  useEffect(() => {
    if (providedClient) {
      setClient(providedClient)
      setFailure(undefined)
      return
    }
    if (!api) {
      setFailure({ message: "EffectAdmin requires either an HttpApi or a client." })
      return
    }
    if (!makeClient) {
      setFailure({
        message: "EffectAdmin requires makeClient when api is provided. Import the adapter for your Effect version, or pass a client."
      })
      return
    }
    let active = true
    const loadClient = makeClient(api, {
      ...(clientOptions as object),
      baseUrl
    } as ClientOptions & AdminClientFactoryOptions)
    loadClient.then(
      (value) => {
        if (active) {
          setClient(value)
          setFailure(undefined)
        }
      },
      (error) => { if (active) setFailure(failureOf(error)) }
    )
    return () => { active = false }
  }, [api, baseUrl, clientOptions, makeClient, providedClient])

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
  if (validationFailure) content = <ErrorState failure={validationFailure} />
  else if (failure) content = <ErrorState failure={failure} />
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
