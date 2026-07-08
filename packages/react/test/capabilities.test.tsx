// @vitest-environment jsdom
import { defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Schema } from "effect"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { EffectAdmin } from "../src/index.js"

afterEach(cleanup)

describe("capability-aware controls", () => {
  it("does not offer an operation disabled by host capabilities", async () => {
    window.history.replaceState(null, "", "/admin/people")
    const Person = Schema.Struct({ id: Schema.Int, name: Schema.String })
    const PeopleApi = HttpApiGroup.make("people")
      .add(HttpApiEndpoint.get("list", "/people"))
      .add(HttpApiEndpoint.post("create", "/people"))
    const people = defineAdminResource({ model: Person, apiGroup: PeopleApi })

    render(
      <EffectAdmin
        resources={[people]}
        capabilities={{ people: { create: false } }}
        client={{
          people: {
            list: () => Effect.succeed({ rows: [{ id: 1, name: "Ada" }], total: 1 }),
            create: () => Effect.die("create must not be called")
          }
        }}
      />
    )

    await screen.findByText("Ada")
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull()
  })
})
