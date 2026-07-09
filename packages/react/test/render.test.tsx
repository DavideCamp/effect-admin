import { defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EffectAdmin } from "../src/index.js"

describe("EffectAdmin", () => {
  it("server-renders a stable shell for client-framework integration", () => {
    const Person = Schema.Struct({ id: Schema.Int, name: Schema.String })
    const PeopleApi = HttpApiGroup.make("people").add(HttpApiEndpoint.get("list", "/people"))
    const people = defineAdminResource({ model: Person, apiGroup: PeopleApi })
    const html = renderToString(
      <EffectAdmin
        resources={[people]}
        clientOptions={{ headers: { "x-admin-role": "staff" } }}
        client={{ people: { list: () => { throw new Error("not run during render") } } }}
      />
    )
    expect(html).toContain("Effect Admin")
    expect(html).toContain("People")
  })
})
