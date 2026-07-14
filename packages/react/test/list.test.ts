import type { FieldMeta } from "@effect-admin/core"
import { describe, expect, it } from "vitest"
import { listFiltersFromQuery } from "../src/list.js"

describe("listFiltersFromQuery", () => {
  it("preserves numeric literal option values", () => {
    const fields: ReadonlyArray<FieldMeta> = [{
      name: "statusCode",
      title: "Status",
      kind: "select",
      optional: false,
      auto: false,
      nullable: false,
      options: [1, 2],
      hidden: false,
      readOnly: false,
      sensitive: false
    }]

    const filters = listFiltersFromQuery(fields, new URLSearchParams("f_statusCode=2"))

    expect(filters).toEqual([
      { field: "statusCode", operator: "eq", value: 2 }
    ])
  })
})
