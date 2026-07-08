# @effect-admin/core

Turns decoded Effect Schema models and `HttpApiGroup` contracts into validated
admin resource metadata. It can also generate a conventional CRUD resource via
`defineCrudResource({ name, model })`, deriving admin create/update payloads
from the model annotations. It contains no React or persistence code.
