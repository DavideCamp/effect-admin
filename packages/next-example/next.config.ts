import type { NextConfig } from "next"

const config: NextConfig = {
  transpilePackages: [
    "@effect-admin/contracts",
    "@effect-admin/core",
    "@effect-admin/react"
  ]
}

export default config
