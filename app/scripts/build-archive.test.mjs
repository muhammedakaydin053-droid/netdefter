// @ts-check
/**
 * Tests for the auditor archive generator.
 *
 * The integration cases build a throwaway git repo, so the whole flow is
 * exercised for real: generate → commit the archive separately → verify. That
 * is the sequence the "archive is always one commit behind" bug came from, and
 * the one `--check` must survive.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ARCHIVE_PREFIX,
  EXCLUDES,
  LISTING_NAME,
  METADATA_NAME,
  ZIP_NAME,
  buildArchive,
  check,
  commitExists,
  contentDigest,
  listingText,
  metadataText,
  parseSourceCommit,
  readZipEntries,
  run,
  writeAtomic,
} from "./build-archive.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** A temp repo with one commit holding a source tree plus every excluded path. */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "archive-test-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "Test");

  mkdirSync(join(root, "app", "src"), { recursive: true });
  mkdirSync(join(root, "app", "public"), { recursive: true });
  mkdirSync(join(root, "app", ".grok", "skills"), { recursive: true });
  writeFileSync(join(root, "app", "src", "index.ts"), "export const x = 1;\n");
  writeFileSync(join(root, "app", "public", "favicon.svg"), "<svg/>\n");
  // Paths that must never reach the archive.
  writeFileSync(join(root, "app", ".grok", "skills", "SKILL.md"), "dev only\n");
  writeFileSync(join(root, "app", ".project_id"), "id\n");
  writeFileSync(join(root, "app", "AGENTS.md"), "app agents\n");
  writeFileSync(join(root, "AGENTS.md"), "root agents\n");
  writeFileSync(join(root, "proxy.py"), "print()\n");
  writeFileSync(join(root, "upload_server.py"), "print()\n");
  writeFileSync(join(root, ".gitignore"), "node_modules/\n");
  writeFileSync(join(root, "app", ".gitignore"), "dist/\n");
  writeFileSync(join(root, "app", ".prettierrc"), "{}\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "source");
  return root;
}

const excludedNames = (entries) => entries.map((e) => e.name);

test("excludes apply when invoked from a subdirectory", () => {
  // npm scripts run from app/, so pathspecs must resolve against the repo root
  // or app/.grok leaks (275 entries instead of 133).
  const root = makeRepo();
  const entries = readZipEntries(buildArchive("HEAD", join(root, "app")));
  const joined = entries.map((e) => e.name).join("\n");
  assert.ok(!joined.includes(".grok"), "alt dizinden çağrılınca .grok sızdı");
  assert.ok(!joined.includes("proxy.py"), "alt dizinden çağrılınca proxy.py sızdı");
  assert.ok(entries.map((e) => e.name).includes(`${ARCHIVE_PREFIX}app/src/index.ts`));
});

test("no excluded path reaches the archive", () => {
  const root = makeRepo();
  const entries = readZipEntries(buildArchive("HEAD", root));
  const names = excludedNames(entries);
  const joined = names.join("\n");

  assert.ok(!joined.includes(".grok"), "app/.grok sızdı");
  assert.ok(!joined.includes("proxy.py"), "proxy.py sızdı");
  assert.ok(!joined.includes("upload_server.py"), "upload_server.py sızdı");
  assert.ok(!names.includes(`${ARCHIVE_PREFIX}app/AGENTS.md`), "app/AGENTS.md sızdı");
  assert.ok(!names.includes(`${ARCHIVE_PREFIX}.gitignore`), ".gitignore sızdı");
  assert.ok(!names.includes(`${ARCHIVE_PREFIX}app/.project_id`), ".project_id sızdı");
  assert.ok(!joined.includes(".git/"), ".git sızdı");
  // Kept files stay.
  assert.ok(names.includes(`${ARCHIVE_PREFIX}app/src/index.ts`));
  assert.ok(names.includes(`${ARCHIVE_PREFIX}AGENTS.md`));
});

test("metadata, listing and zip are excluded from the archive itself", () => {
  // Self-exclusion is what keeps a regeneration byte-identical to the
  // committed archive, so --check can pass after the archive is committed.
  assert.ok(EXCLUDES.includes(METADATA_NAME));
  assert.ok(EXCLUDES.includes(LISTING_NAME));
  assert.ok(EXCLUDES.includes(`app/public/${ZIP_NAME}`));
});

test("listing is sorted file paths with a trailing newline", () => {
  const root = makeRepo();
  const entries = readZipEntries(buildArchive("HEAD", root));
  const text = listingText(entries);
  const lines = text.split("\n");

  assert.equal(lines.at(-1), "", "son satır newline ile bitmeli");
  const files = lines.slice(0, -1);
  assert.deepEqual(files, [...files].sort(), "liste sıralı olmalı");
  assert.ok(files.every((f) => !f.endsWith("/")), "dizin girdisi listeye girmemeli");
  assert.ok(files.every((f) => f.startsWith(ARCHIVE_PREFIX)));
});

test("git archive output is deterministic", () => {
  const root = makeRepo();
  const a = buildArchive("HEAD", root);
  const b = buildArchive("HEAD", root);
  assert.equal(contentDigest(readZipEntries(a)), contentDigest(readZipEntries(b)));
  assert.ok(a.equals(b), "aynı ref iki kez bayt-aynı olmalı");
});

test("writeAtomic replaces the target and removes no old data on success", () => {
  const dir = mkdtempSync(join(tmpdir(), "atomic-"));
  const target = join(dir, "out.txt");
  writeFileSync(target, "eski");
  writeAtomic(target, "yeni");
  assert.equal(readFileSync(target, "utf8"), "yeni");
});

test("writeAtomic keeps the old file when the write fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "atomic-"));
  const target = join(dir, "out.txt");
  writeFileSync(target, "eski");
  // A directory where the temp file must go makes writeFileSync throw.
  mkdirSync(join(dir, `out.txt.tmp-${process.pid}`));
  assert.throws(() => writeAtomic(target, "yeni"));
  assert.equal(readFileSync(target, "utf8"), "eski", "başarısız yazım eskiyi bozmamalı");
});

test("run writes zip, listing and metadata from one ref", () => {
  const root = makeRepo();
  const res = run({ cwd: root });
  const pub = join(root, "app", "public");

  assert.ok(existsSync(join(pub, ZIP_NAME)));
  assert.ok(existsSync(join(pub, LISTING_NAME)));
  assert.ok(existsSync(join(pub, METADATA_NAME)));

  const meta = readFileSync(join(pub, METADATA_NAME), "utf8");
  assert.equal(parseSourceCommit(meta), res.commit);
  assert.match(meta, /SHA-256/);

  const entries = readZipEntries(readFileSync(join(pub, ZIP_NAME)));
  assert.equal(entries.length, res.entryCount);
  assert.equal(readFileSync(join(pub, LISTING_NAME), "utf8"), listingText(entries));
  // The zip must not contain its own metadata.
  assert.ok(!excludedNames(entries).includes(`${ARCHIVE_PREFIX}${METADATA_NAME}`));
});

test("run does not create .vercel when the build dir is absent", () => {
  const root = makeRepo();
  run({ cwd: root });
  assert.ok(!existsSync(join(root, "app", ".vercel")), ".vercel oluşturulmamalı");
});

test("run syncs .vercel only when it already exists", () => {
  const root = makeRepo();
  const vercel = join(root, "app", ".vercel", "output", "static");
  mkdirSync(vercel, { recursive: true });
  run({ cwd: root });
  assert.ok(existsSync(join(vercel, ZIP_NAME)), ".vercel senkronlanmadı");
  assert.equal(
    readFileSync(join(vercel, ZIP_NAME)).equals(readFileSync(join(root, "app", "public", ZIP_NAME))),
    true,
    "iki kopya aynı olmalı",
  );
});

test("run rejects a ref that does not exist and writes nothing", () => {
  const root = makeRepo();
  assert.throws(() => run({ cwd: root, ref: "deadbeef" }));
  assert.ok(!existsSync(join(root, "app", "public", ZIP_NAME)), "başarısız üretim dosya bırakmamalı");
});

test("check passes after the archive is committed as a separate commit", () => {
  const root = makeRepo();
  const res = run({ cwd: root });
  // Commit the generated archive on its own, leaving HEAD ahead of the source.
  git(root, "add", "-A");
  git(root, "commit", "-qm", "archive");
  assert.notEqual(git(root, "rev-parse", "HEAD"), res.commit, "arşiv commit'i ayrı olmalı");
  // HEAD is now ahead; check must still verify against the recorded commit.
  const out = check({ cwd: root });
  assert.equal(out.commit, res.commit);
});

test("check fails when the metadata commit is not in the repo", () => {
  const root = makeRepo();
  run({ cwd: root });
  const metaPath = join(root, "app", "public", METADATA_NAME);
  const meta = readFileSync(metaPath, "utf8").replace(
    /^Kaynak commit.*$/m,
    "Kaynak commit : 0123456789abcdef0123456789abcdef01234567",
  );
  writeFileSync(metaPath, meta);
  assert.throws(() => check({ cwd: root }), /mevcut değil/);
});

test("check fails when the zip content drifts from its source commit", () => {
  const root = makeRepo();
  run({ cwd: root });
  // Source advances and the archive is regenerated from the NEW commit while
  // the metadata still points at the old one — the stale-archive bug shape.
  writeFileSync(join(root, "app", "src", "index.ts"), "export const x = 2;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "source change");
  writeFileSync(join(root, "app", "public", ZIP_NAME), buildArchive("HEAD", root));
  assert.throws(() => check({ cwd: root }), /uyuşmuyor/);
});

test("check fails when the listing disagrees with the zip", () => {
  const root = makeRepo();
  run({ cwd: root });
  writeFileSync(join(root, "app", "public", LISTING_NAME), "netdefter/sahte.txt\n");
  assert.throws(() => check({ cwd: root }), /ZIP-icerigi\.txt/);
});

test("run keeps the root listing copy in sync", () => {
  const root = makeRepo();
  run({ cwd: root });
  assert.equal(
    readFileSync(join(root, LISTING_NAME), "utf8"),
    readFileSync(join(root, "app", "public", LISTING_NAME), "utf8"),
  );
});

test("check fails when the .vercel mirror drifts", () => {
  const root = makeRepo();
  const vercel = join(root, "app", ".vercel", "output", "static");
  mkdirSync(vercel, { recursive: true });
  run({ cwd: root });
  // Advance the source so a freshly built zip has different content, then drop
  // it into the mirror — the stale build artifact that leaked before.
  writeFileSync(join(root, "app", "src", "index.ts"), "export const x = 3;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "source change");
  writeFileSync(join(vercel, ZIP_NAME), buildArchive("HEAD", root));
  assert.throws(() => check({ cwd: root }), /uyuşmuyor/);
});

test("check fails when the root listing copy drifts", () => {
  const root = makeRepo();
  run({ cwd: root });
  writeFileSync(join(root, LISTING_NAME), "netdefter/sahte.txt\n");
  assert.throws(() => check({ cwd: root }), /uyuşmuyor/);
});

test("metadataText round-trips the source commit", () => {
  const text = metadataText({
    commit: "abc1234",
    date: "2026-01-01T00:00:00Z",
    builtAt: "2026-01-02T00:00:00Z",
    sha256: "0".repeat(64),
    digest: "1".repeat(64),
    entryCount: 3,
    fileCount: 2,
    dirCount: 1,
  });
  assert.equal(parseSourceCommit(text), "abc1234");
});

test("parseSourceCommit rejects metadata without a commit line", () => {
  assert.throws(() => parseSourceCommit("başlık\n"), /Kaynak commit/);
});

test("commitExists distinguishes present and absent refs", () => {
  const root = makeRepo();
  assert.equal(commitExists("HEAD", root), true);
  assert.equal(commitExists("deadbeefdeadbeef", root), false);
});
