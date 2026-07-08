// @vitest-environment jsdom
import { defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Schema } from "effect"
import { cleanup, render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { EffectAdmin } from "../src/index.js"

afterEach(cleanup)

describe("custom actions", () => {
  it("derives a payload form, submits it, and shows the returned record", async () => {
    window.history.replaceState(null, "", "/admin/people/1")
    const Person = Schema.Struct({ id: Schema.Int, name: Schema.String, status: Schema.String })
    const PeopleApi = HttpApiGroup.make("people")
      .add(HttpApiEndpoint.get("get", "/people/:id"))
      .add(
        HttpApiEndpoint.post("suspend", "/people/:id/suspend").setPayload(
          Schema.Struct({ reason: Schema.String.annotations({ title: "Reason" }) })
        )
      )
    const people = defineAdminResource({
      model: Person,
      apiGroup: PeopleApi,
      actions: { suspend: { endpoint: "suspend", label: "Suspend" } }
    })
    let received: unknown
    const client = {
      people: {
        get: () => Effect.succeed({ id: 1, name: "Ada", status: "active" }),
        suspend: (request?: unknown) => {
          received = request
          return Effect.succeed({ id: 1, name: "Ada", status: "suspended" })
        }
      }
    }

    render(<EffectAdmin resources={[people]} client={client} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Suspend" }))
    const dialog = await screen.findByRole("dialog", { name: "Suspend" })
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Policy violation")
    await user.click(within(dialog).getByRole("button", { name: "Run action" }))

    expect(received).toEqual({ path: { id: 1 }, payload: { reason: "Policy violation" } })
    expect(await screen.findByText("suspended")).toBeTruthy()
  })
})
