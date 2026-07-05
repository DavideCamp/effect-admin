import { Effect, ParseResult, Schema } from "effect"
import { ValidationError } from "./types.js"

/**
 * Decode repo input with a derived variant schema. Every repo
 * implementation decodes its OWN input (defense in depth: a repo must not
 * trust its callers), and the failure is always a readable
 * ValidationError, never a raw ParseError.
 */
export const decodeWith = (
  schema: Schema.Schema.AnyNoContext,
  data: unknown
): Effect.Effect<Record<string, unknown>, ValidationError> =>
  Schema.decodeUnknown(schema, { onExcessProperty: "error" })(data).pipe(
    Effect.mapError(
      (e) => new ValidationError({ message: ParseResult.TreeFormatter.formatErrorSync(e) })
    )
  ) as Effect.Effect<Record<string, unknown>, ValidationError>
