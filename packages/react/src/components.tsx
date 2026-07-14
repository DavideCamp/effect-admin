import type { AdminResourceDef, FieldMeta } from "@effect-admin/shared"
import type { ComponentType, ReactNode } from "react"
import type { AdminRecord } from "./client.js"
import { navigate, normalizeBasePath, resourcePath } from "./router.js"

export interface LayoutProps {
  readonly basePath: string
  readonly resources: ReadonlyArray<AdminResourceDef>
  readonly currentResource?: string | undefined
  readonly children: ReactNode
}

export interface TextInputProps {
  readonly field: FieldMeta
  readonly value: unknown
  readonly disabled?: boolean | undefined
  readonly required?: boolean | undefined
  readonly error?: ReadonlyArray<string> | undefined
  readonly onChange: (value: unknown) => void
}

export interface DataTableProps {
  readonly resource: AdminResourceDef
  readonly fields: ReadonlyArray<FieldMeta>
  readonly rows: ReadonlyArray<AdminRecord>
  readonly onOpen?: ((row: AdminRecord) => void) | undefined
  readonly orderBy?: string | undefined
  readonly orderDir?: "asc" | "desc" | undefined
  readonly onSort?: ((field: string) => void) | undefined
}

export interface EffectAdminComponents {
  readonly Layout: ComponentType<LayoutProps>
  readonly TextInput: ComponentType<TextInputProps>
  readonly DataTable: ComponentType<DataTableProps>
}

export const DefaultLayout = ({
  basePath,
  resources,
  currentResource,
  children
}: LayoutProps) => (
  <div className="ea-shell">
    <aside className="ea-sidebar">
      <a
        className="ea-brand"
        href={normalizeBasePath(basePath)}
        onClick={(event) => {
          event.preventDefault()
          navigate(normalizeBasePath(basePath))
        }}
      >
        Effect Admin
      </a>
      <nav className="ea-nav" aria-label="Admin resources">
        {resources.map((resource) => (
          <a
            key={resource.name}
            className={resource.name === currentResource ? "is-active" : undefined}
            href={resourcePath(basePath, resource.name)}
            onClick={(event) => {
              event.preventDefault()
              navigate(resourcePath(basePath, resource.name))
            }}
          >
            {resource.label}
          </a>
        ))}
      </nav>
    </aside>
    <main className="ea-main">{children}</main>
  </div>
)

export const DefaultTextInput = ({
  field,
  value,
  disabled,
  required,
  error,
  onChange
}: TextInputProps) => (
  <label className="ea-field">
    <span>{field.title}</span>
    <input
      type={field.sensitive ? "password" : "text"}
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      disabled={disabled}
      required={required}
      aria-invalid={error !== undefined}
      onChange={(event) => onChange(event.target.value)}
    />
    {error?.map((message) => <small key={message}>{message}</small>)}
  </label>
)

const renderValue = (field: FieldMeta, value: unknown) => {
  if (field.sensitive && value != null) return "••••••••"
  if (value == null) return <span className="ea-muted">—</span>
  if (value instanceof Date) return value.toLocaleString()
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export const DefaultDataTable = ({
  resource,
  fields,
  rows,
  onOpen,
  orderBy,
  orderDir,
  onSort
}: DataTableProps) => (
  <div className="ea-table-wrap">
    <table className="ea-table">
      <thead>
        <tr>{fields.map((field) => (
          <th key={field.name}>
            {onSort && field.kind !== "unsupported" ? (
              <button type="button" className="ea-sort" onClick={() => onSort(field.name)}>
                {field.title}{orderBy === field.name ? (orderDir === "desc" ? " ↓" : " ↑") : ""}
              </button>
            ) : field.title}
          </th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={String(row[resource.primaryKey] ?? index)}
            className={onOpen ? "is-clickable" : undefined}
            onClick={() => onOpen?.(row)}
          >
            {fields.map((field, fieldIndex) => <td key={field.name}>
              {onOpen && fieldIndex === 0 ? (
                <button
                  type="button"
                  className="ea-row-open"
                  aria-label={
                    row[resource.primaryKey] === undefined || row[resource.primaryKey] === null
                      ? `Open row ${index + 1}`
                      : `Open ${String(row[resource.primaryKey])}`
                  }
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(row)
                  }}
                >
                  {renderValue(field, row[field.name])}
                </button>
              ) : renderValue(field, row[field.name])}
            </td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export const defaultComponents: EffectAdminComponents = {
  Layout: DefaultLayout,
  TextInput: DefaultTextInput,
  DataTable: DefaultDataTable
}
