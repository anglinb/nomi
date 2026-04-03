import { describe, expect, test } from "bun:test"
import {
  getDataDir,
  getDataDirDisplay,
  getDataRootName,
  getKeybindingsFilePath,
  getKeybindingsFilePathDisplay,
  getRuntimeProfile,
} from "./branding"

describe("runtime profile helpers", () => {
  test("defaults to the prod profile when unset", () => {
    expect(getRuntimeProfile({})).toBe("prod")
    expect(getDataRootName({})).toBe(".nomi")
    expect(getDataDir("/tmp/home", {})).toBe("/tmp/home/.nomi/data")
    expect(getDataDirDisplay({})).toBe("~/.nomi/data")
    expect(getKeybindingsFilePath("/tmp/home", {})).toBe("/tmp/home/.nomi/keybindings.json")
    expect(getKeybindingsFilePathDisplay({})).toBe("~/.nomi/keybindings.json")
  })

  test("switches to dev paths for the dev profile", () => {
    const env = { NOMI_RUNTIME_PROFILE: "dev" }

    expect(getRuntimeProfile(env)).toBe("dev")
    expect(getDataRootName(env)).toBe(".nomi-dev")
    expect(getDataDir("/tmp/home", env)).toBe("/tmp/home/.nomi-dev/data")
    expect(getDataDirDisplay(env)).toBe("~/.nomi-dev/data")
    expect(getKeybindingsFilePath("/tmp/home", env)).toBe("/tmp/home/.nomi-dev/keybindings.json")
    expect(getKeybindingsFilePathDisplay(env)).toBe("~/.nomi-dev/keybindings.json")
  })
})
