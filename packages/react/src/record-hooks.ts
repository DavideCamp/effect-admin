import type { AdminResourceDef, FieldMeta } from "@effect-admin/shared"
import { useEffect, useState } from "react"
import { runEndpoint, type AdminClient, type AdminEndpoint, type AdminRecord } from "./client.js"
import { coerceId, endpoint, failureOf, initialRecord, type Failure } from "./internal.js"
import { navigate, recordPath, resourcePath } from "./router.js"

export type RecordMode = "create" | "detail" | "edit"

export const payloadFromRecord = (
  record: AdminRecord,
  fields: ReadonlyArray<FieldMeta>
): AdminRecord =>
  Object.fromEntries(fields.flatMap((field) => {
    const value = record[field.name]
    if (value === "" && field.optional) return []
    return [[field.name, value]]
  }))

export const useRecord = ({
  client,
  resource,
  basePath,
  id,
  mode,
  editableFields
}: {
  readonly client: AdminClient
  readonly resource: AdminResourceDef
  readonly basePath: string
  readonly id?: string | undefined
  readonly mode: RecordMode
  readonly editableFields: ReadonlyArray<FieldMeta>
}) => {
  const [record, setRecord] = useState<AdminRecord>(
    mode === "create" ? initialRecord(resource) : {}
  )
  const [loading, setLoading] = useState(mode !== "create")
  const [failure, setFailure] = useState<Failure>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFailure(undefined)
    setSaving(false)
    if (mode === "create") {
      setRecord(initialRecord(resource))
      setLoading(false)
      return
    }
    if (id === undefined) return
    const method = endpoint<AdminRecord>(client, resource, "get")
    if (!method) {
      setFailure({ message: "This resource has no get endpoint." })
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    runEndpoint(method({ path: { id: coerceId(resource, id) } })).then(
      (value) => {
        if (active) {
          setRecord(value)
          setLoading(false)
        }
      },
      (error) => {
        if (active) {
          setFailure(failureOf(error))
          setLoading(false)
        }
      }
    )
    return () => { active = false }
  }, [client, resource, id, mode])

  const updateField = (field: string, value: unknown) =>
    setRecord((current) => ({ ...current, [field]: value }))

  const save = () => {
    const operation = mode === "create" ? "create" : "update"
    const method = endpoint<AdminRecord>(client, resource, operation)
    if (!method) return
    const payload = payloadFromRecord(record, editableFields)
    setSaving(true)
    setFailure(undefined)
    const request = mode === "create"
      ? { payload }
      : { path: { id: coerceId(resource, id!) }, payload }
    runEndpoint(method(request)).then(
      (saved) => {
        const savedId = saved?.[resource.primaryKey] ?? id
        navigate(resource.operations.get && savedId !== undefined && savedId !== null
          ? recordPath(basePath, resource.name, String(savedId))
          : resourcePath(basePath, resource.name))
      },
      (error) => {
        setFailure(failureOf(error))
        setSaving(false)
      }
    )
  }

  const remove = () => {
    if (id === undefined) return
    const method = endpoint<void>(client, resource, "delete")
    if (!method) return
    setSaving(true)
    runEndpoint(method({ path: { id: coerceId(resource, id) } })).then(
      () => navigate(resourcePath(basePath, resource.name)),
      (error) => {
        setFailure(failureOf(error))
        setSaving(false)
      }
    )
  }

  return {
    record,
    setRecord,
    updateField,
    loading,
    failure,
    setFailure,
    saving,
    setSaving,
    save,
    remove
  }
}

export const useAction = ({
  client,
  resource,
  id,
  setRecord,
  setFailure
}: {
  readonly client: AdminClient
  readonly resource: AdminResourceDef
  readonly id?: string | undefined
  readonly setRecord: (record: AdminRecord) => void
  readonly setFailure: (failure: Failure | undefined) => void
}) => {
  const [runningAction, setRunningAction] = useState<string>()
  const [activeAction, setActiveAction] = useState<string>()
  const [actionValues, setActionValues] = useState<AdminRecord>({})
  const [actionFailure, setActionFailure] = useState<Failure>()

  const openAction = (name: string) => {
    const action = resource.actions[name]
    if (!action) return
    setActionValues(initialRecord({ ...resource, fields: action.fields }))
    setActionFailure(undefined)
    setActiveAction(name)
  }

  const closeAction = (open: boolean) => {
    if (!open && runningAction === undefined) setActiveAction(undefined)
  }

  const runAction = (name: string, payload?: AdminRecord) => {
    if (id === undefined) return
    const action = resource.actions[name]
    const method = action
      ? client[resource.groupName]?.[action.endpoint] as AdminEndpoint | undefined
      : undefined
    if (!action || !method) return
    setRunningAction(name)
    setFailure(undefined)
    setActionFailure(undefined)
    runEndpoint(method({
      path: { id: coerceId(resource, id) },
      ...(action.fields.length > 0 ? { payload: payload ?? {} } : {})
    })).then(
      (value) => {
        if (value && typeof value === "object") setRecord(value as AdminRecord)
        setRunningAction(undefined)
        setActiveAction(undefined)
        setActionValues({})
      },
      (error) => {
        setActionFailure(failureOf(error))
        setRunningAction(undefined)
      }
    )
  }

  return {
    runningAction,
    activeAction,
    setActiveAction,
    actionValues,
    setActionValues,
    actionFailure,
    selectedAction: activeAction ? resource.actions[activeAction] : undefined,
    openAction,
    closeAction,
    runAction
  }
}
