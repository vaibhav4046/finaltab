import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  DEMO_KEY_STORAGE_KEY,
  clearPersistedKeys,
  isPersistenceEnabled,
  isValidPrivateKey,
  loadPersistedKeys,
  persistKeys,
  resolveDemoKeys,
  type StorageLike,
} from "../lib/demoKeys";

/** In-memory Storage stand-in that also records how often it was written to. */
function fakeStorage(seed?: Record<string, string>): StorageLike & {
  data: Record<string, string>;
  writes: number;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    writes: 0,
    getItem(key) {
      return key in data ? data[key]! : null;
    },
    setItem(key, value) {
      data[key] = value;
      this.writes++;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

/** Storage that throws on every operation, like a locked-down privacy mode. */
const hostileStorage: StorageLike = {
  getItem() {
    throw new Error("storage denied");
  },
  setItem() {
    throw new Error("storage denied");
  },
  removeItem() {
    throw new Error("storage denied");
  },
};

const IDS = ["vee", "hem", "ravi"] as const;
const VALID_KEY = `0x${"a".repeat(64)}` as const;

describe("isPersistenceEnabled", () => {
  it("returns true only for the exact string 1", () => {
    expect(isPersistenceEnabled({ NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS: "1" })).toBe(true);
  });

  it("stays off when the flag is unset", () => {
    expect(isPersistenceEnabled({})).toBe(false);
  });

  it.each(["0", "true", "yes", "TRUE", " 1", "1 ", ""])(
    "stays off for the near-miss value %j",
    (value) => {
      expect(isPersistenceEnabled({ NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS: value })).toBe(false);
    }
  );

  it("reads the flag as a literal process.env member expression", () => {
    // Regression guard. Next.js substitutes NEXT_PUBLIC_* vars into the client
    // bundle by matching the exact source text `process.env.NEXT_PUBLIC_FOO`.
    // Aliasing `process.env` to a parameter or variable first defeats that
    // substitution, and the browser then sees `undefined` no matter what
    // .env.local says — which is exactly the bug this replaced. A unit test
    // cannot observe bundler output, so assert on the source instead.
    const source = readFileSync(
      fileURLToPath(new URL("../lib/demoKeys.ts", import.meta.url)),
      "utf8"
    );
    expect(source).toContain("process.env.NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS");
  });
});

describe("isValidPrivateKey", () => {
  it("accepts 0x plus 64 hex characters", () => {
    expect(isValidPrivateKey(VALID_KEY)).toBe(true);
    expect(isValidPrivateKey(`0x${"A1b2".repeat(16)}`)).toBe(true);
  });

  it.each([
    ["missing prefix", "a".repeat(64)],
    ["too short", `0x${"a".repeat(63)}`],
    ["too long", `0x${"a".repeat(65)}`],
    ["non-hex character", `0x${"z".repeat(64)}`],
    ["empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(isValidPrivateKey(value)).toBe(false);
  });

  it.each([[null], [undefined], [42], [{}], [[]]])("rejects the non-string %j", (value) => {
    expect(isValidPrivateKey(value)).toBe(false);
  });
});

describe("loadPersistedKeys", () => {
  it("returns an empty map when nothing is stored", () => {
    expect(loadPersistedKeys(fakeStorage())).toEqual({});
  });

  it("returns an empty map when storage is unavailable", () => {
    expect(loadPersistedKeys(null)).toEqual({});
  });

  it("keeps valid entries and drops malformed ones", () => {
    // Arrange
    const storage = fakeStorage({
      [DEMO_KEY_STORAGE_KEY]: JSON.stringify({ vee: VALID_KEY, hem: "not-a-key", ravi: 7 }),
    });

    // Act
    const loaded = loadPersistedKeys(storage);

    // Assert
    expect(loaded).toEqual({ vee: VALID_KEY });
  });

  it.each([
    ["invalid JSON", "{ not json"],
    ["a JSON array", "[]"],
    ["a JSON null", "null"],
    ["a JSON scalar", '"hello"'],
  ])("returns an empty map for %s instead of throwing", (_label, raw) => {
    const storage = fakeStorage({ [DEMO_KEY_STORAGE_KEY]: raw });
    expect(() => loadPersistedKeys(storage)).not.toThrow();
    expect(loadPersistedKeys(storage)).toEqual({});
  });

  it("swallows a storage that throws on read", () => {
    expect(loadPersistedKeys(hostileStorage)).toEqual({});
  });
});

describe("persistKeys", () => {
  it("writes the map as JSON under the versioned key", () => {
    const storage = fakeStorage();
    persistKeys(storage, { vee: VALID_KEY });
    expect(JSON.parse(storage.data[DEMO_KEY_STORAGE_KEY]!)).toEqual({ vee: VALID_KEY });
  });

  it("does not throw when storage rejects the write", () => {
    expect(() => persistKeys(hostileStorage, { vee: VALID_KEY })).not.toThrow();
  });

  it("does nothing when storage is unavailable", () => {
    expect(() => persistKeys(null, { vee: VALID_KEY })).not.toThrow();
  });
});

describe("clearPersistedKeys", () => {
  it("removes the stored record", () => {
    const storage = fakeStorage({ [DEMO_KEY_STORAGE_KEY]: JSON.stringify({ vee: VALID_KEY }) });
    clearPersistedKeys(storage);
    expect(storage.getItem(DEMO_KEY_STORAGE_KEY)).toBeNull();
  });

  it("does not throw when storage rejects the removal", () => {
    expect(() => clearPersistedKeys(hostileStorage)).not.toThrow();
  });
});

describe("resolveDemoKeys when persistence is disabled", () => {
  it("returns one key per id", () => {
    const keys = resolveDemoKeys({ ids: IDS, enabled: false });
    expect(Object.keys(keys).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(isValidPrivateKey(keys[id])).toBe(true);
  });

  it("returns different keys on every call", () => {
    const first = resolveDemoKeys({ ids: IDS, enabled: false });
    const second = resolveDemoKeys({ ids: IDS, enabled: false });
    for (const id of IDS) expect(second[id]).not.toBe(first[id]);
  });

  it("never writes to storage", () => {
    // The safe default must leave no key material behind.
    const storage = fakeStorage();
    resolveDemoKeys({ ids: IDS, enabled: false, storage });
    expect(storage.writes).toBe(0);
    expect(storage.data[DEMO_KEY_STORAGE_KEY]).toBeUndefined();
  });

  it("ignores keys that were previously persisted", () => {
    const storage = fakeStorage({
      [DEMO_KEY_STORAGE_KEY]: JSON.stringify({ vee: VALID_KEY }),
    });
    const keys = resolveDemoKeys({ ids: IDS, enabled: false, storage });
    expect(keys.vee).not.toBe(VALID_KEY);
  });
});

describe("resolveDemoKeys when persistence is enabled", () => {
  it("returns the same keys across calls so a funded address survives a reload", () => {
    // Arrange
    const storage = fakeStorage();

    // Act — two independent calls model two page loads.
    const first = resolveDemoKeys({ ids: IDS, enabled: true, storage });
    const second = resolveDemoKeys({ ids: IDS, enabled: true, storage });

    // Assert
    expect(second).toEqual(first);
  });

  it("writes the generated keys on first use", () => {
    const storage = fakeStorage();
    const keys = resolveDemoKeys({ ids: IDS, enabled: true, storage });
    expect(JSON.parse(storage.data[DEMO_KEY_STORAGE_KEY]!)).toEqual(keys);
  });

  it("does not rewrite storage when every key is already present", () => {
    const storage = fakeStorage();
    resolveDemoKeys({ ids: IDS, enabled: true, storage });
    const writesAfterFirst = storage.writes;
    resolveDemoKeys({ ids: IDS, enabled: true, storage });
    expect(storage.writes).toBe(writesAfterFirst);
  });

  it("keeps the persisted key and regenerates only the missing ones", () => {
    // Arrange — one signer stored, two absent.
    const storage = fakeStorage({
      [DEMO_KEY_STORAGE_KEY]: JSON.stringify({ vee: VALID_KEY }),
    });

    // Act
    const keys = resolveDemoKeys({ ids: IDS, enabled: true, storage });

    // Assert
    expect(keys.vee).toBe(VALID_KEY);
    expect(isValidPrivateKey(keys.hem)).toBe(true);
    expect(isValidPrivateKey(keys.ravi)).toBe(true);
  });

  it("replaces a malformed persisted key rather than handing it to viem", () => {
    const storage = fakeStorage({
      [DEMO_KEY_STORAGE_KEY]: JSON.stringify({ vee: "0xdeadbeef" }),
    });
    const keys = resolveDemoKeys({ ids: IDS, enabled: true, storage });
    expect(keys.vee).not.toBe("0xdeadbeef");
    expect(isValidPrivateKey(keys.vee)).toBe(true);
  });

  it("preserves persisted signers that are not in the requested id list", () => {
    // A stored identity from another surface must not be wiped by a narrower call.
    const storage = fakeStorage({
      [DEMO_KEY_STORAGE_KEY]: JSON.stringify({ other: VALID_KEY }),
    });
    resolveDemoKeys({ ids: ["vee"], enabled: true, storage });
    expect(loadPersistedKeys(storage).other).toBe(VALID_KEY);
  });

  it("still returns usable keys when storage is unavailable", () => {
    const keys = resolveDemoKeys({ ids: IDS, enabled: true, storage: null });
    for (const id of IDS) expect(isValidPrivateKey(keys[id])).toBe(true);
  });

  it("still returns usable keys when storage throws", () => {
    const keys = resolveDemoKeys({ ids: IDS, enabled: true, storage: hostileStorage });
    for (const id of IDS) expect(isValidPrivateKey(keys[id])).toBe(true);
  });
});
