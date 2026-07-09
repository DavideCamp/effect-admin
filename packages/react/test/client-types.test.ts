import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
import type {
  AdminClient,
  AdminListResult,
  AdminRecord
} from "../src/index.js"

describe("AdminClient", () => {
  it("accepts custom endpoint request types", () => {
    type ListRequest = {
      readonly urlParams: Readonly<Record<string, unknown>>
    }
    type PathRequest = {
      readonly path: { readonly id: string | number }
    }
    type PayloadRequest = {
      readonly payload: AdminRecord
    }

    const client = {
      users: {
        list: (_request: ListRequest) =>
          Effect.succeed({ rows: [], total: 0 } satisfies AdminListResult),
        get: ({ path }: PathRequest) =>
          Effect.succeed({ id: path.id, email: "ada@example.com" } satisfies AdminRecord),
        create: ({ payload }: PayloadRequest) =>
          Effect.succeed(payload),
        update: ({ path, payload }: PathRequest & PayloadRequest) =>
          Effect.succeed({ ...payload, id: path.id }),
        delete: (_request: PathRequest) =>
          Effect.void
      }
    } satisfies AdminClient

    expect(Object.keys(client.users)).toEqual(["list", "get", "create", "update", "delete"])
  })
})
