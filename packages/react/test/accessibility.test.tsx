// @vitest-environment jsdom
import { defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Schema } from "effect"
import { cleanup, render, screen } from "@testing-library/react"
import { axe } from "vitest-axe"
import { afterEach, describe, expect, it } from "vitest"
import { EffectAdmin } from "../src/index.js"

afterEach(cleanup)

describe("accessibility", () => {
  it("has no automated violations on a populated resource list", async () => {
    window.history.replaceState(null, "", "/admin/people")
    const Person = Schema.Struct({ id: Schema.Int, name: Schema.String })
    const PeopleApi = HttpApiGroup.make("people")
      .add(HttpApiEndpoint.get("list", "/people"))
      .add(HttpApiEndpoint.get("get", "/people/:id"))
    const people = defineAdminResource({ model: Person, apiGroup: PeopleApi })
    const { container } = render(
      <EffectAdmin
        resources={[people]}
        client={{
          people: {
            list: () => Effect.succeed({ rows: [{ id: 1, name: "Ada" }], total: 1 }),
            get: () => Effect.succeed({ id: 1, name: "Ada" })
          }
        }}
      />
    )

    await screen.findByText("Ada")
    expect(screen.getByRole("button", { name: "Open 1" })).toBeDefined()
    // jsdom has no layout/canvas, so contrast is verified in the browser pass.
    const result = await axe(container, { rules: { "color-contrast": { enabled: false } } })
    expect(result.violations.map(({ id }) => id)).toEqual([])
  })
})
