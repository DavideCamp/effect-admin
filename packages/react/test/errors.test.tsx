// @vitest-environment jsdom
import { defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Schema } from "effect"
import { cleanup, render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { EffectAdmin } from "../src/index.js"

afterEach(cleanup)

describe("host authorization errors", () => {
  it("renders a dedicated forbidden state for a server 403", async () => {
    window.history.replaceState(null, "", "/admin/people")
    const Person = Schema.Struct({ id: Schema.Int, name: Schema.String })
    const PeopleApi = HttpApiGroup.make("people").add(HttpApiEndpoint.get("list", "/people"))
    const people = defineAdminResource({ model: Person, apiGroup: PeopleApi })
    const forbidden = {
      _tag: "ResponseError",
      message: "403 GET /people",
      response: { status: 403 }
    }

    render(
      <EffectAdmin
        resources={[people]}
        client={{ people: { list: () => Effect.fail(forbidden) } }}
      />
    )

    expect(await screen.findByText("Forbidden")).toBeTruthy()
  })

  it("shows a clear error when a list row is missing the primary key", async () => {
    window.history.replaceState(null, "", "/admin/people")
    const Person = Schema.Struct({ id: Schema.Int, name: Schema.String })
    const PeopleApi = HttpApiGroup.make("people")
      .add(HttpApiEndpoint.get("list", "/people"))
      .add(HttpApiEndpoint.get("get", "/people/:id"))
    const people = defineAdminResource({ model: Person, apiGroup: PeopleApi })

    render(
      <EffectAdmin
        resources={[people]}
        client={{
          people: {
            list: () => Effect.succeed({ rows: [{ name: "Ada" }], total: 1 }),
            get: () => Effect.die("get must not be called")
          }
        }}
      />
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Open row 1" }))

    expect(await screen.findByText("Missing primary key")).toBeTruthy()
  })
})
