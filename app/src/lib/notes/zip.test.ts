/**
 * ZIP güvenlik testleri — allow-list, path traversal, zip bomb, gerçek
 * bayt sayacı ve round-trip.
 *
 * `vite` ile yüklenir (uzantısız göreli import'lar).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";
import { zipSync, strToU8 } from "fflate";

let server: ViteDevServer;
let Z: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  Z = await server.ssrLoadModule("/src/lib/notes/zip.ts");
});

after(async () => {
  await server?.close();
});

const UUID = "12345678-1234-1234-1234-123456789abc";

describe("isAllowedPath", () => {
  it("izinli yolları kabul eder", () => {
    assert.equal(Z.isAllowedPath("manifest.json"), true);
    assert.equal(Z.isAllowedPath("notes.json"), true);
    assert.equal(Z.isAllowedPath(`images/${UUID}.png`), true);
    assert.equal(Z.isAllowedPath(`images/${UUID}.webp`), true);
  });

  it("path traversal / mutlak yol / alt dizin reddeder", () => {
    assert.equal(Z.isAllowedPath("../notes.json"), false);
    assert.equal(Z.isAllowedPath("/etc/passwd"), false);
    assert.equal(Z.isAllowedPath("images/../../x.png"), false);
    assert.equal(Z.isAllowedPath("images/sub/dir/x.png"), false);
    assert.equal(Z.isAllowedPath("notes.json.bak"), false);
    assert.equal(Z.isAllowedPath("images/x.svg"), false);
    assert.equal(Z.isAllowedPath("images/not-a-uuid.png"), false);
  });
});

describe("readZipSecurely", () => {
  it("geçerli arşivi açar", () => {
    const zip = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "netdefter-notes-backup" })),
      "notes.json": strToU8(JSON.stringify({ notes: [] })),
      [`images/${UUID}.png`]: new Uint8Array([1, 2, 3, 4]),
    });
    const r = Z.readZipSecurely(zip);
    assert.equal(r.ok, true);
    assert.ok(r.files["manifest.json"]);
    assert.ok(r.files["notes.json"]);
    assert.ok(r.files[`images/${UUID}.png`]);
  });

  it("izinsiz yolu reddeder", () => {
    const zip = zipSync({
      "manifest.json": strToU8("{}"),
      "../evil.json": strToU8("{}"),
    });
    const r = Z.readZipSecurely(zip);
    assert.equal(r.ok, false);
    assert.match(r.error, /izinsiz yol|geçersiz/);
  });

  it("geçersiz/rastgele veriyi reddeder (0 dosya)", () => {
    const r = Z.readZipSecurely(strToU8("bu bir zip değil"));
    assert.equal(r.ok, false);
  });

  it("manifest/notes eksikse reddeder", () => {
    const zip = zipSync({ "manifest.json": strToU8("{}") });
    const read = Z.readZipSecurely(zip);
    assert.equal(read.ok, true);
    const parsed = Z.parseZipFiles(read.files);
    assert.equal(parsed.ok, false);
  });
});

describe("buildZip / parseZipFiles — round-trip", () => {
  it("manifest + notes + görselleri geri okur", () => {
    const imgBytes = new Uint8Array([9, 8, 7, 6, 5]);
    const zip = Z.buildZip({ format: "netdefter-notes-backup", version: 1 }, { notes: [{ id: "n1" }] }, [
      { name: `${UUID}.png`, bytes: imgBytes },
    ]);
    const read = Z.readZipSecurely(zip);
    assert.equal(read.ok, true);
    const parsed = Z.parseZipFiles(read.files);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.images.length, 1);
    assert.deepEqual([...parsed.images[0].bytes], [...imgBytes]);
  });
});
