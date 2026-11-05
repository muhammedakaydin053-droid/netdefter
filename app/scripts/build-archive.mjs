#!/usr/bin/env node
// @ts-check
/**
 * Auditor source archive generator.
 *
 * The archive, its listing (`ZIP-icerigi.txt`) and its metadata
 * (`ARSIV-BILGISI.txt`) are produced from ONE `git archive` run of ONE ref, so
 * the three can never disagree about which source version they describe.
 *
 * `git archive` reads COMMITTED objects and never emits `.git`, so the history
 * cannot leak into the archive. Extra exclusions drop local-only tooling and
 * workspace metadata.
 *
 * Writes are atomic (temp file + rename). A failure at any step leaves the
 * previous archive untouched, so a half-written or corrupt zip can never be
 * served.
 *
 * Usage:
 *   node scripts/build-archive.mjs [--ref <ref>]   # build (default ref: HEAD)
 *   node scripts/build-archive.mjs --check         # verify committed archive
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ARCHIVE_PREFIX = "netdefter/";
export const ZIP_NAME = "netdefter-kaynak.zip";
export const LISTING_NAME = "ZIP-icerigi.txt";
export const METADATA_NAME = "ARSIV-BILGISI.txt";

/**
 * Paths kept out of the archive (repo-root relative).
 *
 * `app/.grok/**` are dev skills, `proxy.py` / `upload_server.py` are
 * local-only tooling, the dotfiles and `app/AGENTS.md` are workspace metadata.
 * The metadata file, the listing and the archive itself are excluded so the
 * archive never contains its own output — otherwise every regeneration would
 * differ from the committed one and `--check` could never pass.
 */
export const EXCLUDES = [
  "app/.grok",
  "proxy.py",
  "upload_server.py",
  ".gitignore",
  "app/.gitignore",
  "app/.prettierrc",
  "app/.project_id",
  "app/AGENTS.md",
  LISTING_NAME,
  METADATA_NAME,
  `app/public/${ZIP_NAME}`,
];

/** Runs a git command and returns stdout as a string. */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
}

/** Repo root, so paths are stable no matter where the script is invoked. */
export function repoRoot(cwd) {
  return git(["rev-parse", "--show-toplevel"], cwd);
}

/** True when `ref` resolves to a commit that exists in this repository. */
export function commitExists(ref, cwd) {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The zip bytes for `ref`, with EXCLUDES applied. */
export function buildArchive(ref, cwd) {
  // Pathspecs are resolved relative to the git cwd, so run from the repo root:
  // EXCLUDES are written root-relative, and `git archive` must see the whole
  // tree (prefix stays `netdefter/`). Running from `app/` silently keeps
  // `app/.grok/**` because `app/.grok` no longer matches.
  const root = repoRoot(cwd);
  const args = ["archive", "--format=zip", `--prefix=${ARCHIVE_PREFIX}`, ref, "--", "."];
  for (const e of EXCLUDES) args.push(`:(exclude)${e}`);
  return execFileSync("git", args, { cwd: root, maxBuffer: 512 * 1024 * 1024 });
}

/**
 * Minimal ZIP central-directory reader.
 *
 * Only the fields needed to compare two archives are extracted (name, CRC-32,
 * uncompressed size), so no decompression is required.
 */
export function readZipEntries(buf) {
  const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buf.lastIndexOf(EOCD);
  if (eocd < 0) throw new Error("ZIP sonu (EOCD) bulunamadı");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("ZIP merkezi dizini bozuk");
    const crc = buf.readUInt32LE(off + 16);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries.push({ name, crc, size });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** File (non-directory) paths in an archive, sorted. */
export function listingFromEntries(entries) {
  return entries
    .map((e) => e.name)
    .filter((n) => !n.endsWith("/"))
    .sort();
}

/** The `ZIP-icerigi.txt` body: one file path per line, trailing newline. */
export function listingText(entries) {
  const files = listingFromEntries(entries);
  return files.length ? `${files.join("\n")}\n` : "";
}

/**
 * A stable digest of archive CONTENT, ignoring compression/ordering noise.
 * Two archives with the same files and same bytes produce the same digest.
 */
export function contentDigest(entries) {
  const h = createHash("sha256");
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    h.update(`${e.name}\0${e.crc}\0${e.size}\n`);
  }
  return h.digest("hex");
}

/** Metadata body. `--check` reads the `Kaynak commit` line back from here. */
export function metadataText(info) {
  return [
    "NetDefter kaynak arşivi",
    "=======================",
    "",
    `Kaynak commit : ${info.commit}`,
    `Commit tarihi : ${info.date}`,
    `Üretim zamanı : ${info.builtAt}`,
    `Arşiv dosyası : ${ZIP_NAME}`,
    `ZIP girdisi   : ${info.entryCount} (${info.fileCount} dosya + ${info.dirCount} dizin)`,
    `SHA-256       : ${info.sha256}`,
    `İçerik özeti  : ${info.digest}`,
    `Dışlananlar   : ${EXCLUDES.join(", ")}`,
    "",
  ].join("\n");
}

/** Extracts the source commit recorded in a metadata file body. */
export function parseSourceCommit(text) {
  const m = text.match(/^Kaynak commit\s*:\s*([0-9a-f]{7,40})\s*$/m);
  if (!m) throw new Error("ARSIV-BILGISI.txt içinde 'Kaynak commit' satırı yok");
  return m[1];
}

/** Writes `data` atomically: a temp sibling is renamed over the target. */
export function writeAtomic(target, data) {
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

function describe(entries) {
  const dirCount = entries.filter((e) => e.name.endsWith("/")).length;
  const fileCount = entries.length - dirCount;
  return { entryCount: entries.length, fileCount, dirCount };
}

/** Builds the archive for `ref` and writes it to every existing target dir. */
export function run({ ref = "HEAD", cwd = process.cwd() } = {}) {
  const root = repoRoot(cwd);
  if (!commitExists(ref, cwd)) throw new Error(`Commit bulunamadı: ${ref}`);
  const commit = git(["rev-parse", ref], cwd);
  const date = git(["show", "-s", "--format=%cI", commit], cwd);

  const zip = buildArchive(commit, cwd);
  const entries = readZipEntries(zip); // throws on a corrupt archive
  if (!entries.length) throw new Error("Üretilen arşiv boş");
  const digest = contentDigest(entries);
  const sha256 = createHash("sha256").update(zip).digest("hex");
  const counts = describe(entries);

  const metadata = metadataText({ commit, date, builtAt: new Date().toISOString(), sha256, digest, ...counts });
  const listing = listingText(entries);

  const targets = [join(root, "app", "public")];
  const vercel = join(root, "app", ".vercel", "output", "static");
  if (existsSync(vercel)) targets.push(vercel);

  for (const dir of targets) {
    writeAtomic(join(dir, ZIP_NAME), zip);
    writeAtomic(join(dir, LISTING_NAME), listing);
    writeAtomic(join(dir, METADATA_NAME), metadata);
  }
  // The repo root keeps a tracked copy of the listing; it is served from
  // app/public, so keep the duplicate in sync rather than letting it go stale.
  writeAtomic(join(root, LISTING_NAME), listing);

  console.log(`Kaynak commit : ${commit}`);
  console.log(`ZIP girdisi   : ${counts.entryCount} (${counts.fileCount} dosya + ${counts.dirCount} dizin)`);
  console.log(`SHA-256       : ${sha256}`);
  console.log(`Yazılan yer   : ${[...targets, root].join(", ")}`);
  return { commit, sha256, digest, ...counts, targets };
}

/** Verifies the committed archive against the commit recorded in its metadata. */
export function check({ cwd = process.cwd() } = {}) {
  const root = repoRoot(cwd);
  const publicDir = join(root, "app", "public");
  const zipPath = join(publicDir, ZIP_NAME);
  const metaPath = join(publicDir, METADATA_NAME);
  const listPath = join(publicDir, LISTING_NAME);

  if (!existsSync(zipPath)) throw new Error(`Arşiv yok: ${zipPath}`);
  if (!existsSync(metaPath)) throw new Error(`Metadata yok: ${metaPath}`);

  const commit = parseSourceCommit(readFileSync(metaPath, "utf8"));
  if (!commitExists(commit, cwd)) throw new Error(`Metadata'daki commit mevcut değil: ${commit}`);

  const committed = readZipEntries(readFileSync(zipPath));
  const expected = readZipEntries(buildArchive(commit, cwd));

  const a = contentDigest(committed);
  const b = contentDigest(expected);
  if (a !== b) {
    const got = new Set(listingFromEntries(committed));
    const want = new Set(listingFromEntries(expected));
    const extra = [...got].filter((n) => !want.has(n));
    const missing = [...want].filter((n) => !got.has(n));
    throw new Error(
      `Arşiv ${commit} ile uyuşmuyor (içerik farkı).` +
        (missing.length ? ` Eksik: ${missing.slice(0, 5).join(", ")}` : "") +
        (extra.length ? ` Fazla: ${extra.slice(0, 5).join(", ")}` : "") +
        (missing.length || extra.length ? "" : " (aynı dosyalar, farklı içerik)"),
    );
  }

  if (existsSync(listPath)) {
    const onDisk = readFileSync(listPath, "utf8");
    const derived = listingText(committed);
    if (onDisk !== derived) throw new Error(`${LISTING_NAME} arşivle uyuşmuyor`);
  }

  // The root copy and the .vercel copy are mirrors of the same source version;
  // a drifted mirror is exactly the stale-archive bug this check exists for.
  const rootList = join(root, LISTING_NAME);
  if (existsSync(rootList) && readFileSync(rootList, "utf8") !== listingText(committed)) {
    throw new Error(`Kök ${LISTING_NAME} arşivle uyuşmuyor`);
  }
  const vercelZip = join(root, "app", ".vercel", "output", "static", ZIP_NAME);
  if (existsSync(vercelZip)) {
    const v = contentDigest(readZipEntries(readFileSync(vercelZip)));
    if (v !== a) throw new Error(`.vercel kopyası arşivle uyuşmuyor`);
  }

  const sha256 = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  console.log(`OK — arşiv ${commit} ile uyuşuyor`);
  console.log(`ZIP girdisi   : ${committed.length}`);
  console.log(`SHA-256       : ${sha256}`);
  return { commit, sha256, entries: committed.length };
}

const isMain = process.argv[1] && process.argv[1].endsWith("build-archive.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  const mode = args.includes("--check") ? "check" : "run";
  const refIdx = args.indexOf("--ref");
  const ref = refIdx >= 0 ? args[refIdx + 1] : "HEAD";
  try {
    if (mode === "check") check({});
    else run({ ref });
  } catch (err) {
    console.error(`HATA: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
