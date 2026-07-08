// @vitest-environment jsdom
import { defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Schema } from "effect"
import { cleanup, render, screen } from "@testing-library/react"
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

    expect((await screen.findByRole("strong")).textContent).toBe("Forbidden")
  })
})
