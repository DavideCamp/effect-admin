import type { AdminCapabilities } from "@effect-admin/contracts"
import type { AdminResourceDef, FieldMeta } from "@effect-admin/core"
import * as Dialog from "@radix-ui/react-dialog"
import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { runEndpoint, type AdminClient } from "./client.js"
import type { EffectAdminComponents, TextInputProps } from "./components.js"
import {
  can,
  coerceId,
  endpoint,
  ErrorState,
  failureOf,
  fieldByName,
  initialRecord,
  Loading,
  type Failure
} from "./internal.js"
import { navigate } from "./router.js"

const useDebounced = (value: string, delayMs: number) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])
  return debounced
}

export const Home = ({ resources, basePath }: {
  resources: ReadonlyArray<AdminResourceDef>
  basePath: string
}) => (
  <section>
    <header className="ea-page-header">
      <div><p className="ea-eyebrow">Administration</p><h1>Resources</h1></div>
    </header>
    <div className="ea-resource-grid">
      {resources.map((resource) => (
        <a
          key={resource.name}
          href={`${basePath}/${resource.name}`}
          onClick={(event) => {
            event.preventDefault()
            navigate(`${basePath}/${resource.name}`)
          }}
        >
          <strong>{resource.label}</strong>
          <span>{resource.fields.length} fields</span>
        </a>
      ))}
    </div>
  </section>
)

export const ListScreen = ({
  client,
  resource,
  basePath,
  location,
  capabilities,
  DataTable
}: {
  client: AdminClient
  resource: AdminResourceDef
  basePath: string
  location: string
  capabilities?: AdminCapabilities | undefined
  DataTable: EffectAdminComponents["DataTable"]
}) => {
  const query = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location])
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1)
  const pageSize = 25
  const search = query.get("search") ?? ""
  const orderBy = query.get("orderBy") ?? undefined
  const orderDir = query.get("orderDir") === "desc" ? "desc" : "asc"
  const filterFields = resource.fields.filter((field) =>
    !field.hidden && !resource.fieldConfig[field.name]?.hidden && ["text", "select", "checkbox"].includes(field.kind)
  )
  const filters = filterFields.flatMap((field) => {
    const value = query.get(`f_${field.name}`)
    if (value === null || value === "") return []
    return [{
      field: field.name,
      operator: field.kind === "text" ? "contains" as const : "eq" as const,
      value: field.kind === "checkbox" ? value === "true" : value
    }]
  })
  const [result, setResult] = useState<{ rows: ReadonlyArray<Record<string, unknown>>; total: number }>()
  const [failure, setFailure] = useState<Failure>()
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const method = endpoint(client, resource, "list")
    if (!method) {
      setFailure({ message: `Resource "${resource.label}" has no list endpoint.` })
      return
    }
    let active = true
    setFailure(undefined)
    runEndpoint(method({
      urlParams: {
        page,
        pageSize,
        ...(search ? { search } : {}),
        ...(orderBy ? { orderBy, orderDir } : {}),
        ...(filters.length ? { filters } : {})
      }
    })).then(
      (value) => { if (active) setResult(value) },
      (error) => { if (active) setFailure(failureOf(error)) }
    )
    return () => { active = false }
  }, [client, resource, page, search, orderBy, orderDir, JSON.stringify(filters), revision])

  const setQuery = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === "") next.delete(key)
      else next.set(key, value)
    }
    navigate(`${basePath}/${resource.name}${next.size ? `?${next}` : ""}`)
  }
  const fields = resource.listColumns
    .map((name) => fieldByName(resource, name))
    .filter((field): field is FieldMeta =>
      field !== undefined && !field.hidden && !resource.fieldConfig[field.name]?.hidden
    )

  return (
    <section>
      <header className="ea-page-header">
        <div><p className="ea-eyebrow">Resource</p><h1>{resource.label}</h1></div>
        {resource.operations.create && can(capabilities, resource.name, "create") && (
          <button className="ea-button" onClick={() => navigate(`${basePath}/${resource.name}/new`)}>
            Create
          </button>
        )}
      </header>
      <div className="ea-toolbar">
        <input
          aria-label="Search"
          placeholder="Search…"
          defaultValue={search}
          onKeyDown={(event) => {
            if (event.key === "Enter") setQuery({ search: event.currentTarget.value, page: undefined })
          }}
        />
        {filterFields.slice(0, 3).map((field) => field.kind === "select" ? (
          <select
            key={field.name}
            aria-label={field.title}
            value={query.get(`f_${field.name}`) ?? ""}
            onChange={(event) => setQuery({ [`f_${field.name}`]: event.target.value, page: undefined })}
          >
            <option value="">All {field.title}</option>
            {field.options?.map((option) => <option key={String(option)} value={String(option)}>{option}</option>)}
          </select>
        ) : field.kind === "checkbox" ? (
          <select
            key={field.name}
            aria-label={field.title}
            value={query.get(`f_${field.name}`) ?? ""}
            onChange={(event) => setQuery({ [`f_${field.name}`]: event.target.value, page: undefined })}
          >
            <option value="">All {field.title}</option><option value="true">Yes</option><option value="false">No</option>
          </select>
        ) : null)}
      </div>
      {failure ? <ErrorState failure={failure} retry={() => setRevision((n) => n + 1)} /> : !result ? <Loading /> : result.rows.length === 0 ? (
        <div className="ea-state">No records found.</div>
      ) : (
        <>
          <DataTable
            resource={resource}
            fields={fields}
            rows={result.rows}
            orderBy={orderBy}
            orderDir={orderDir}
            onSort={(field) => setQuery({
              orderBy: field,
              orderDir: orderBy === field && orderDir === "asc" ? "desc" : "asc",
              page: undefined
            })}
            {...(resource.operations.get && can(capabilities, resource.name, "get") ? {
              onOpen: (row: Record<string, unknown>) =>
                navigate(`${basePath}/${resource.name}/${String(row[resource.primaryKey])}`)
            } : {})}
          />
          <footer className="ea-pagination">
            <span>{result.total} records</span>
            <div>
              <button disabled={page <= 1} onClick={() => setQuery({ page: String(page - 1) })}>Previous</button>
              <span>Page {page} of {Math.max(1, Math.ceil(result.total / pageSize))}</span>
              <button disabled={page * pageSize >= result.total} onClick={() => setQuery({ page: String(page + 1) })}>Next</button>
            </div>
          </footer>
        </>
      )}
    </section>
  )
}

const RelationInput = ({
  client,
  resources,
  field,
  value,
  disabled,
  error,
  onChange
}: TextInputProps & { client: AdminClient; resources: ReadonlyArray<AdminResourceDef> }) => {
  const relation = resources.find((item) => item.name === field.relation?.resource)
  const [rows, setRows] = useState<ReadonlyArray<Record<string, unknown>>>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string>()
  const debouncedSearch = useDebounced(search, 250)

  useEffect(() => {
    if (!relation) return
    const method = endpoint(client, relation, "list")
    if (!method) return
    let active = true
    setLoading(true)
    setLookupError(undefined)
    runEndpoint(method({
      urlParams: {
        page: 1,
        pageSize: 25,
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      }
    })).then(
      (result) => {
        if (active) {
          setRows(result.rows)
          setLoading(false)
        }
      },
      (error) => {
        if (active) {
          setLookupError(failureOf(error).message)
          setLoading(false)
        }
      }
    )
    return () => { active = false }
  }, [client, relation, debouncedSearch])

  if (!relation) return <div className="ea-field"><span>{field.title}</span><em>Unknown relation</em></div>

  const labelField = field.relation?.displayField ?? relation.primaryKey
  const multiple = field.relation?.multiple ?? false
  const multipleSelected = Array.isArray(value) ? value.map((item) => String(item)) : []
  const singleSelected = value == null ? "" : String(value)
  const selected = multiple ? multipleSelected : singleSelected
  const selectedValues = multiple ? multipleSelected : singleSelected === "" ? [] : [singleSelected]
  const rowsById = new Map(rows.map((row) => [String(row[relation.primaryKey]), row]))
  const optionRows = [
    ...selectedValues
      .filter((id) => !rowsById.has(id))
      .map((id) => ({ [relation.primaryKey]: id, [labelField]: `Selected ${id}` })),
    ...rows
  ]
  const required = !field.optional && !field.nullable

  return (
    <label className="ea-field ea-relation">
      <span>{field.title}</span>
      <input
        aria-label={`Search ${field.title}`}
        placeholder={`Search ${relation.label}…`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select aria-label={field.title} multiple={multiple} disabled={disabled} required={required} aria-invalid={error !== undefined} value={selected} onChange={(event) => {
        const convert = (raw: string) => field.kind === "number" && raw !== "" ? Number(raw) : raw
        onChange(multiple
          ? Array.from(event.target.selectedOptions, (option) => convert(option.value))
          : convert(event.target.value))
      }}>
        {!multiple && <option value="">Select…</option>}
        {optionRows.map((row) => (
          <option key={String(row[relation.primaryKey])} value={String(row[relation.primaryKey])}>
            {String(row[labelField] ?? row[relation.primaryKey])}
          </option>
        ))}
      </select>
      {loading && <small className="ea-muted">Loading options…</small>}
      {lookupError && <small>{lookupError}</small>}
      {error?.map((message) => <small key={message}>{message}</small>)}
    </label>
  )
}

const FieldInput = ({
  client,
  resources,
  resource,
  field,
  value,
  disabled,
  error,
  TextInput,
  onChange
}: TextInputProps & {
  client: AdminClient
  resources: ReadonlyArray<AdminResourceDef>
  resource: AdminResourceDef
  TextInput: EffectAdminComponents["TextInput"]
}) => {
  const required = !field.optional && !field.nullable
  if (field.relation) return <RelationInput {...{ client, resources, field, value, disabled, error, onChange }} />
  const widget = resource.fieldConfig[field.name]?.widget ?? field.kind
  if (widget === "checkbox") return (
    <label className="ea-field ea-check">
      <input type="checkbox" checked={Boolean(value)} disabled={disabled} required={required} aria-invalid={error !== undefined} onChange={(e) => onChange(e.target.checked)} />
      <span>{field.title}</span>
    </label>
  )
  if (widget === "select") return (
    <label className="ea-field"><span>{field.title}</span><select
      value={value == null ? "" : String(value)} disabled={disabled} required={required} aria-invalid={error !== undefined}
      onChange={(event) => {
        const option = field.options?.find((item) => String(item) === event.target.value)
        onChange(option ?? event.target.value)
      }}
    ><option value="">Select…</option>{field.options?.map((item) => <option key={String(item)}>{item}</option>)}</select>
    {error?.map((message) => <small key={message}>{message}</small>)}</label>
  )
  if (widget === "textarea") return (
    <label className="ea-field"><span>{field.title}</span><textarea value={String(value ?? "")} disabled={disabled} required={required} aria-invalid={error !== undefined} onChange={(e) => onChange(e.target.value)} />
    {error?.map((message) => <small key={message}>{message}</small>)}</label>
  )
  if (widget === "number") return (
    <label className="ea-field"><span>{field.title}</span><input type="number" value={value == null ? "" : String(value)} disabled={disabled} required={required} aria-invalid={error !== undefined}
      onChange={(e) => onChange(e.target.value === "" ? (field.nullable ? null : "") : Number(e.target.value))} />
    {error?.map((message) => <small key={message}>{message}</small>)}</label>
  )
  if (widget === "date") {
    const shown = value instanceof Date ? value.toISOString().slice(0, 16) : typeof value === "string" ? value.slice(0, 16) : ""
    return <label className="ea-field"><span>{field.title}</span><input type="datetime-local" value={shown} disabled={disabled} required={required} aria-invalid={error !== undefined}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : field.nullable ? null : "")} />
      {error?.map((message) => <small key={message}>{message}</small>)}</label>
  }
  return <TextInput {...{ field, value, disabled, required, error, onChange }} />
}

export const RecordScreen = ({
  client,
  resources,
  resource,
  basePath,
  id,
  mode,
  capabilities,
  TextInput
}: {
  client: AdminClient
  resources: ReadonlyArray<AdminResourceDef>
  resource: AdminResourceDef
  basePath: string
  id?: string | undefined
  mode: "create" | "detail" | "edit"
  capabilities?: AdminCapabilities | undefined
  TextInput: EffectAdminComponents["TextInput"]
}) => {
  const [record, setRecord] = useState<Record<string, unknown>>(
    mode === "create" ? initialRecord(resource) : {}
  )
  const [loading, setLoading] = useState(mode !== "create")
  const [failure, setFailure] = useState<Failure>()
  const [saving, setSaving] = useState(false)
  const [runningAction, setRunningAction] = useState<string>()
  const [activeAction, setActiveAction] = useState<string>()
  const [actionValues, setActionValues] = useState<Record<string, unknown>>({})
  const [actionFailure, setActionFailure] = useState<Failure>()
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (mode === "create" || id === undefined) return
    const method = endpoint(client, resource, "get")
    if (!method) { setFailure({ message: "This resource has no get endpoint." }); setLoading(false); return }
    let active = true
    setLoading(true)
    runEndpoint(method({ path: { id: coerceId(resource, id) } })).then(
      (value) => { if (active) { setRecord(value); setLoading(false) } },
      (error) => { if (active) { setFailure(failureOf(error)); setLoading(false) } }
    )
    return () => { active = false }
  }, [client, resource, id, mode])

  const editableFields = resource.fields.filter((field) =>
    !field.hidden && !resource.fieldConfig[field.name]?.hidden && !field.auto && !field.readOnly && !resource.fieldConfig[field.name]?.readOnly && field.kind !== "unsupported" && field.name !== resource.primaryKey
  )
  const visibleFields = resource.fields.filter((field) =>
    !field.hidden && !resource.fieldConfig[field.name]?.hidden
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const operation = mode === "create" ? "create" : "update"
    const method = endpoint(client, resource, operation)
    if (!method) return
    const payload = Object.fromEntries(editableFields.flatMap((field) => {
      const value = record[field.name]
      if (value === "" && field.optional) return []
      return [[field.name, value]]
    }))
    setSaving(true)
    setFailure(undefined)
    const request = mode === "create"
      ? { payload }
      : { path: { id: coerceId(resource, id!) }, payload }
    runEndpoint(method(request)).then(
      (saved) => {
        const savedId = saved?.[resource.primaryKey] ?? id
        navigate(resource.operations.get && savedId !== undefined
          ? `${basePath}/${resource.name}/${String(savedId)}`
          : `${basePath}/${resource.name}`)
      },
      (error) => { setFailure(failureOf(error)); setSaving(false) }
    )
  }
  const remove = () => {
    if (id === undefined) return
    const method = endpoint(client, resource, "delete")
    if (!method) return
    setSaving(true)
    runEndpoint(method({ path: { id: coerceId(resource, id) } })).then(
      () => navigate(`${basePath}/${resource.name}`),
      (error) => { setFailure(failureOf(error)); setSaving(false); setDeleteOpen(false) }
    )
  }
  const runAction = (name: string, payload?: Record<string, unknown>) => {
    if (id === undefined) return
    const action = resource.actions[name]
    const method = action ? client[resource.groupName]?.[action.endpoint] : undefined
    if (!action || !method) return
    setRunningAction(name)
    setFailure(undefined)
    setActionFailure(undefined)
    runEndpoint(method({
      path: { id: coerceId(resource, id) },
      ...(action.fields.length > 0 ? { payload: payload ?? {} } : {})
    })).then(
      (value) => {
        if (value && typeof value === "object") setRecord(value as Record<string, unknown>)
        setRunningAction(undefined)
        setActiveAction(undefined)
        setActionValues({})
      },
      (error) => {
        const actionError = failureOf(error)
        setActionFailure(actionError)
        setRunningAction(undefined)
      }
    )
  }
  const selectedAction = activeAction ? resource.actions[activeAction] : undefined

  if (loading) return <Loading />
  if (failure && mode === "detail" && Object.keys(record).length === 0) return <ErrorState failure={failure} />
  const title = mode === "create" ? `Create ${resource.label}` : String(record[resource.primaryKey] ?? resource.label)
  return (
    <section>
      <header className="ea-page-header">
        <div><button className="ea-back" onClick={() => navigate(`${basePath}/${resource.name}`)}>← {resource.label}</button><h1>{title}</h1></div>
        <div className="ea-actions">
          {mode === "detail" && Object.entries(resource.actions).map(([name, action]) =>
            capabilities?.[resource.name]?.actions?.[name] === false ? null : (
              <button
                key={name}
                className="ea-button secondary"
                disabled={runningAction !== undefined}
                onClick={() => {
                  if (action.fields.length === 0 && !action.confirm) runAction(name)
                  else {
                    setActionValues(initialRecord({ ...resource, fields: action.fields }))
                    setActionFailure(undefined)
                    setActiveAction(name)
                  }
                }}
              >
                {runningAction === name ? "Working…" : action.label ?? name}
              </button>
            ))}
          {mode === "detail" && resource.operations.update && can(capabilities, resource.name, "update") && (
            <button className="ea-button" onClick={() => navigate(`${basePath}/${resource.name}/${id}/edit`)}>Edit</button>
          )}
          {mode === "detail" && resource.operations.delete && can(capabilities, resource.name, "delete") && (
            <button className="ea-button danger" onClick={() => setDeleteOpen(true)}>Delete</button>
          )}
        </div>
      </header>
      {failure && <ErrorState failure={failure} />}
      {mode === "detail" ? (
        <dl className="ea-detail">
          {visibleFields.map((field) => <div key={field.name}><dt>{field.title}</dt><dd>{field.sensitive && record[field.name] != null ? "••••••••" : String(record[field.name] ?? "—")}</dd></div>)}
        </dl>
      ) : (
        <form className="ea-form" onSubmit={submit}>
          {editableFields.map((field) => (
            <FieldInput
              key={field.name}
              client={client}
              resources={resources}
              resource={resource}
              field={field}
              value={record[field.name]}
              error={failure?.fields?.[field.name]}
              TextInput={TextInput}
              onChange={(value) => setRecord((current) => ({ ...current, [field.name]: value }))}
            />
          ))}
          <div className="ea-form-actions"><button className="ea-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
        </form>
      )}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="ea-dialog-overlay" />
          <Dialog.Content className="ea-dialog">
            <Dialog.Title>Delete this record?</Dialog.Title>
            <Dialog.Description>This action cannot be undone.</Dialog.Description>
            <div className="ea-form-actions">
              <Dialog.Close asChild><button className="ea-button secondary">Cancel</button></Dialog.Close>
              <button className="ea-button danger" disabled={saving} onClick={remove}>Delete</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={activeAction !== undefined}
        onOpenChange={(open) => { if (!open && runningAction === undefined) setActiveAction(undefined) }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="ea-dialog-overlay" />
          <Dialog.Content className="ea-dialog">
            <Dialog.Title>{selectedAction?.label ?? activeAction}</Dialog.Title>
            {selectedAction?.confirm && <Dialog.Description>{selectedAction.confirm}</Dialog.Description>}
            {selectedAction && activeAction && (
              <form onSubmit={(event) => {
                event.preventDefault()
                runAction(activeAction, actionValues)
              }}>
                <div className="ea-action-fields">
                  {selectedAction.fields.map((field) => (
                    <FieldInput
                      key={field.name}
                      client={client}
                      resources={resources}
                      resource={resource}
                      field={field}
                      value={actionValues[field.name]}
                      error={actionFailure?.fields?.[field.name]}
                      TextInput={TextInput}
                      onChange={(value) => setActionValues((current) => ({
                        ...current,
                        [field.name]: value
                      }))}
                    />
                  ))}
                </div>
                {actionFailure && <p className="ea-inline-error">{actionFailure.message}</p>}
                <div className="ea-form-actions">
                  <Dialog.Close asChild><button type="button" className="ea-button secondary">Cancel</button></Dialog.Close>
                  <button className="ea-button" disabled={runningAction !== undefined}>
                    {runningAction ? "Working…" : "Run action"}
                  </button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
