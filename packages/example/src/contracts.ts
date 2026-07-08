import * as Schema from "effect/Schema"

export const SuspendUser = Schema.Struct({
  reason: Schema.String.pipe(Schema.minLength(3)).annotations({ title: "Reason" })
})

export const PublishPost = Schema.Struct({
  note: Schema.String.annotations({ title: "Publication note" })
})
