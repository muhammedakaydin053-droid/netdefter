import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = here;

const curriculum = JSON.parse(readFileSync(join(dataDir, "curriculum.json"), "utf8")) as {
  exam: string;
  subject: string;
  topic: string;
  subtopic: string;
}[];

const topicKeys = new Set(curriculum.map((r) => `${r.exam}|${r.subject}|${r.topic}`));
const subjectTopics = new Set(curriculum.map((r) => `${r.subject}|${r.topic}`));

/** `{ exam: "TYT", subject: "Matematik", topic: "Mantık", ... }` satırlarındaki alanları çeker. */
function entries(src: string): { exam: string; subject: string; topic: string }[] {
  const out: { exam: string; subject: string; topic: string }[] = [];
  const rowRe = /\{\s*exam:\s*"([^"]+)"[\s\S]*?subject:\s*"([^"]+)"[\s\S]*?topic:\s*"([^"]+)"/g;
  for (const m of src.matchAll(rowRe)) out.push({ exam: m[1], subject: m[2], topic: m[3] });
  return out;
}

/** Yalnızca `[ "A", "B" ]` gibi saf string dizilerini döker; nesne dizilerini atlar. */
function stringArrays(src: string): { name: string; values: string[] }[] {
  const out: { name: string; values: string[] }[] = [];
  const re = /(?:export\s+)?const\s+([A-Z0-9_]+)\s*(?::[^=\n]+)?=\s*\[([^\]]*)\]/g;
  for (const m of src.matchAll(re)) {
    if (m[2].includes("{")) continue;
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
    if (values.length) out.push({ name: m[1], values });
  }
  return out;
}

const roadmapSrc = readFileSync(join(dataDir, "roadmap.ts"), "utf8");
const guaranteedSrc = readFileSync(join(dataDir, "guaranteed.ts"), "utf8");

describe("curriculum.json", () => {
  it("has no fully duplicate records", () => {
    const seen = new Set<string>();
    for (const r of curriculum) {
      const key = `${r.exam}|${r.subject}|${r.topic}|${r.subtopic}`;
      assert.ok(!seen.has(key), `yinelenen kayıt: ${key}`);
      seen.add(key);
    }
  });

  it("uses only TYT and AYT as exam names", () => {
    for (const r of curriculum) assert.ok(r.exam === "TYT" || r.exam === "AYT", `geçersiz exam: ${r.exam}`);
  });
});

describe("roadmap + guaranteed references", () => {
  it("every GuaranteeRow topic exists in curriculum.json", () => {
    for (const e of entries(guaranteedSrc)) {
      assert.ok(
        topicKeys.has(`${e.exam}|${e.subject}|${e.topic}`),
        `guaranteed.ts müfredatta olmayan konuya atıf yapıyor: ${e.exam}|${e.subject}|${e.topic}`,
      );
    }
  });

  it("every gate / core topic array resolves to a real curriculum topic", () => {
    // Kapı dizilerinin adı hangi derse ait olduğunu söyler. Önceki sürüm yalnızca
    // "herhangi bir derste var mı" diye bakıyordu; bu yüzden Fizik kapısına
    // yanlışlıkla Kimya konusu yazılsa test yine geçerdi. Artık ders eşleşmesi
    // de denetleniyor, çünkü ad uyuşmazlığı kapıyı sessizce hiç açmaz hâle getirir.
    const subjectOf: Record<string, string> = {
      MAT: "Matematik",
      FIZ: "Fizik",
      KIM: "Kimya",
      BIO: "Biyoloji",
      TYT: "Türkçe",
    };
    for (const arr of stringArrays(roadmapSrc)) {
      const prefix = Object.keys(subjectOf).find((p) => arr.name.startsWith(p));
      const expected = prefix ? subjectOf[prefix] : null;
      for (const v of arr.values) {
        const inExpected = expected ? subjectTopics.has(`${expected}|${v}`) : true;
        const anywhere = [...subjectTopics].some((k) => k.endsWith(`|${v}`));
        assert.ok(
          anywhere,
          `roadmap.ts ${arr.name} içinde müfredatta olmayan konu: ${v}`,
        );
        if (expected) {
          assert.ok(
            inExpected,
            `roadmap.ts ${arr.name} konuyu ${expected} yerine başka derse bağlamış: ${v}`,
          );
        }
      }
    }
  });

  it("every inline { exam, subject, topic } row in roadmap.ts exists in curriculum.json", () => {
    for (const e of entries(roadmapSrc)) {
      assert.ok(
        topicKeys.has(`${e.exam}|${e.subject}|${e.topic}`),
        `roadmap.ts müfredatta olmayan konuya atıf yapıyor: ${e.exam}|${e.subject}|${e.topic}`,
      );
    }
  });

  it("kapı konu sayısı metinlerde doğru yazılmış", () => {
    // Regresyon: kimya kapısı 5 konuya çıkarıldıktan sonra açıklama metinleri
    // "kimya kapısı (4)" demeye devam etti. Ekranda panel "0/5" gösterirken
    // yanındaki cümle "(4)" diyordu. Sayıyı metne elle yazmak yerine burada
    // denetliyoruz ki liste değişince metin sessizce bayatlamasın.
    const count = (name: string) => {
      const m = roadmapSrc.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
      assert.ok(m, `${name} bulunamadı`);
      return (m![1].match(/"/g) ?? []).length / 2;
    };
    const fiz = count("FIZ_AYT_GATE");
    const kim = count("KIM_AYT_GATE");
    const sources = [
      ["timeline.ts", readFileSync(join(dataDir, "timeline.ts"), "utf8")],
      ["roadmap.ts", roadmapSrc],
    ] as const;
    for (const [file, src] of sources) {
      const fizMatch = src.match(/fizik kapısı \((\d+)\)|Fizik (\d+) konu/);
      if (fizMatch) {
        assert.equal(Number(fizMatch[1] ?? fizMatch[2]), fiz, `${file}: fizik kapısı sayısı yanlış`);
      }
      const kimMatch = src.match(/kimya kapısı \((\d+)\)|kimya (\d+) konu/);
      if (kimMatch) {
        assert.equal(Number(kimMatch[1] ?? kimMatch[2]), kim, `${file}: kimya kapısı sayısı yanlış`);
      }
    }
  });
});
