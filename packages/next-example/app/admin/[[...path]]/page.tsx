"use client"

import { AdminListParams, AdminListResult } from "@effect-admin/contracts"
import { defineAdminResource } from "@effect-admin/core"
import { EffectAdmin } from "@effect-admin/react"
import * as HttpApi from "@effect/platform/HttpApi"
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as Schema from "effect/Schema"

const Person = Schema.Struct({ id: Schema.Int, name: Schema.String })
const PeopleApi = HttpApiGroup.make("people").add(
  HttpApiEndpoint.get("list", "/people")
    .setUrlParams(AdminListParams)
    .addSuccess(AdminListResult(Person))
)
const AppApi = HttpApi.make("next-fixture").add(PeopleApi).prefix("/api")
const resources = [defineAdminResource({ model: Person, apiGroup: PeopleApi })]

export default function AdminPage() {
  return <EffectAdmin api={AppApi} resources={resources} basePath="/admin" />
}
