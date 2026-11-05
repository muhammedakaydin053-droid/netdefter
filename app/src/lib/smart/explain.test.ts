/**
 * `explainStage` tutarlılık testleri.
 *
 * Arayüzdeki açıklama metinleri ile `learningStage` hesabı asla çelişmemeli.
 * En kritik kural: `explainStage(...).mastered` ile
 * `learningStage(...) === "ogrenildi"` her girdide aynı olmalı. Ayrıca
 * `gateBlockers`'ın döndürdüğü liste, `aytUnlocks`'un saydığı eksiklerle
 * uyuşmalı.
 *
 * `vite` ile yüklenir çünkü roadmap `@/` takma adı kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let P: any, R: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  P = await server.ssrLoadModule("/src/lib/smart/progress.ts");
  R = await server.ssrLoadModule("/src/data/roadmap.ts");
});

after(async () => {
  await server?.close();
});

const STATUSES = ["Başlamadım", "Çalışıyorum", "Bitti", "Tekrar Gerekli"];

describe("explainStage — learningStage ile tutarlılık", () => {
  it("mastered alanı her girdide learningStage ile aynı", () => {
    const totals = [null, 0, 1, 5, 10, 13, 14, 15, 16, 20, 30];
    let checked = 0;
    for (const status of STATUSES) {
      for (const total of totals) {
        for (const correct of [null, 0, 1, Math.floor((total ?? 0) / 2), total ?? 0]) {
          if (correct != null && total != null && correct > total) continue;
          const row = { status, total, correct };
          const stage = P.learningStage(row);
          const ex = P.explainStage(row);
          assert.equal(
            ex.mastered,
            stage === "ogrenildi",
            `uyuşmazlık: ${JSON.stringify(row)} -> stage=${stage}, mastered=${ex.mastered}`,
          );
          checked++;
        }
      }
    }
    assert.ok(checked > 100, `yeterli örnek taranmadı: ${checked}`);
  });

  it("eşikler tek kaynaktan gelir ve beklenen değerlerdir", () => {
    assert.equal(P.MIN_QUESTIONS_FOR_MASTERED, 15);
    assert.equal(P.MASTERY_RATIO, 0.7);
  });

  it("14/14 için başarı yeterli ama soru yetersiz mesajı verir", () => {
    const ex = P.explainStage({ status: "Bitti", total: 14, correct: 14 });
    assert.equal(ex.completed, true);
    assert.equal(ex.enoughSuccess, true, "başarı yeterli olmalı");
    assert.equal(ex.enoughQuestions, false, "soru yetersiz olmalı");
    assert.equal(ex.mastered, false);
    assert.match(ex.summary, /yeterli soru verisi yok/);
    assert.ok(ex.missing.some((m: string) => m.includes("yeterli soru verisi yok")));
  });

  it("15/15 için öğrenildi mesajı verir", () => {
    const ex = P.explainStage({ status: "Bitti", total: 15, correct: 15 });
    assert.equal(ex.mastered, true);
    assert.match(ex.summary, /Öğrenildi sayıldı/);
    assert.equal(ex.missing.length, 0);
  });

  it("13/20 için başarı düşük mesajı verir", () => {
    const ex = P.explainStage({ status: "Bitti", total: 20, correct: 13 });
    assert.equal(ex.enoughQuestions, true);
    assert.equal(ex.enoughSuccess, false);
    assert.equal(ex.mastered, false);
    assert.match(ex.summary, /başarı oranı hedefin altında/);
  });

  it("soru verisi olmayan 'Bitti' konuyu anlatım aşamasında bırakır", () => {
    const ex = P.explainStage({ status: "Bitti", total: null, correct: null });
    assert.equal(ex.mastered, false);
    assert.equal(ex.enoughQuestions, false);
    assert.equal(ex.enoughSuccess, false);
    assert.equal(P.learningStage({ status: "Bitti", total: null, correct: null }), "anlatim");
  });
});

describe("explainStage — 'Tekrar Gerekli' açıklaması", () => {
  it("'Tekrar Gerekli' için 'tamamlanmadı' DEMEZ, tekrar gerekçesi verir", () => {
    const ex = P.explainStage({ status: "Tekrar Gerekli", total: 30, correct: 28 });
    assert.equal(ex.completed, false, "tekrar gerekli, bitti değil");
    assert.equal(ex.mastered, false);
    assert.ok(
      !ex.missing.some((m: string) => m.includes("tamamlan")),
      `yanlış gerekçe: ${JSON.stringify(ex.missing)}`,
    );
    assert.ok(
      ex.missing.some((m: string) => m.includes("tekrar")),
      `tekrar gerekçesi yok: ${JSON.stringify(ex.missing)}`,
    );
    assert.match(ex.summary, /[Tt]ekrar/);
  });

  it("soru ve başarı yeterli olsa bile 'Tekrar Gerekli' öğrenildi sayılmaz", () => {
    // 30/30: iki sayısal eşik de karşılanır; yine de tekrar gerekiyor.
    const ex = P.explainStage({ status: "Tekrar Gerekli", total: 30, correct: 30 });
    assert.equal(ex.enoughQuestions, true);
    assert.equal(ex.enoughSuccess, true);
    assert.equal(ex.mastered, false);
    assert.equal(P.learningStage({ status: "Tekrar Gerekli", total: 30, correct: 30 }), "tekrar-gerekli");
  });

  it("'Tekrar Gerekli' + yetersiz soru: her iki gerekçe de doğru yazılır", () => {
    const ex = P.explainStage({ status: "Tekrar Gerekli", total: 5, correct: 2 });
    assert.ok(ex.missing.some((m: string) => m.includes("tekrar")));
    assert.ok(ex.missing.some((m: string) => m.includes("yeterli soru verisi yok")));
    assert.ok(ex.missing.some((m: string) => m.includes("başarı oranı düşük")));
    assert.ok(!ex.missing.some((m: string) => m.includes("tamamlan")));
  });

  it("soru verisi olmayan 'Tekrar Gerekli' de 'tamamlanmadı' demez", () => {
    const ex = P.explainStage({ status: "Tekrar Gerekli", total: null, correct: null });
    assert.ok(!ex.missing.some((m: string) => m.includes("tamamlan")));
    assert.ok(ex.missing.some((m: string) => m.includes("tekrar")));
  });

  it("'Başlamadım' hâlâ 'tamamlanmadı' der (regresyon koruması)", () => {
    const ex = P.explainStage({ status: "Başlamadım", total: null, correct: null });
    assert.ok(ex.missing.some((m: string) => m.includes("konu tamamlandı olarak işaretlenmedi")));
  });

  it("'Çalışıyorum' hâlâ 'tamamlanmadı' der (regresyon koruması)", () => {
    const ex = P.explainStage({ status: "Çalışıyorum", total: 8, correct: 5 });
    assert.ok(ex.missing.some((m: string) => m.includes("konu tamamlandı olarak işaretlenmedi")));
  });
});

describe("gateBlockers — kapıyı kapatan konular", () => {
  it("kapı açıkken hiç engel döndürmez", () => {
    const curr = [
      ...R.MAT_AYT_GATE.map((topic: string) => ({
        exam: "TYT",
        subject: "Matematik",
        topic,
        subtopic: "alt",
        status: "Bitti",
        total: 20,
        correct: 18,
        wrong: 2,
      })),
    ];
    const blockers = R.gateBlockers(curr, "Matematik", R.MAT_AYT_GATE);
    assert.equal(blockers.length, 0, `beklenmeyen engel: ${blockers.map((b: any) => b.topic).join(", ")}`);
  });

  it("eksik konuları adlarıyla ve gerekçesiyle listeler", () => {
    const rows = [
      { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "alt", status: "Bitti", total: 20, correct: 18, wrong: 2 },
      { exam: "TYT", subject: "Matematik", topic: "Sayı Basamakları", subtopic: "alt", status: "Bitti", total: 14, correct: 14, wrong: 0 },
    ];
    const blockers = R.gateBlockers(rows, "Matematik", R.MAT_AYT_GATE);
    // 1 konu tamam, 1 konu soru sayısı yetersiz, kalanı hiç yok.
    const names = blockers.map((b: any) => b.topic);
    assert.ok(!names.includes("Temel Kavramlar"), "tamamlanan konu engel olmamalı");
    assert.ok(names.includes("Sayı Basamakları"), "yetersiz konu engel olmalı");
    const sb = blockers.find((b: any) => b.topic === "Sayı Basamakları");
    assert.match(sb.reason, /yeterli soru verisi yok/);
    assert.equal(sb.total, 14);
  });

  it("engel sayısı aytUnlocks eksik sayısıyla tutarlı", () => {
    const rows = [
      { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "alt", status: "Bitti", total: 20, correct: 18, wrong: 2 },
    ];
    const blockers = R.gateBlockers(rows, "Matematik", R.MAT_AYT_GATE);
    const unlocks = R.aytUnlocks(rows as any);
    assert.equal(
      blockers.length,
      unlocks.mat.total - unlocks.mat.done,
      `engel ${blockers.length}, aytUnlocks eksik ${unlocks.mat.total - unlocks.mat.done}`,
    );
  });

  it("müfredatta olmayan kapı konusunu bildirir", () => {
    const blockers = R.gateBlockers([], "Matematik", ["Temel Kavramlar"]);
    assert.equal(blockers.length, 1);
    assert.match(blockers[0].reason, /bulunamadı/);
    assert.deepEqual(blockers[0].subtopics, []);
  });
});

describe("gateBlockers — çoklu eksik alt konu", () => {
  // Gerçek müfredatta 56 konunun birden fazla alt konusu var. Sabit bir
  // varsayım yapmamak için hedef konuyu müfredattan seçiyoruz.

  it("birden fazla eksik alt konunun HEPSİNİ listeler", async () => {
    const S = await server.ssrLoadModule("/src/lib/store.ts");
    const fresh = S.seedTopics();
    // Aynı konu altında en az 2 alt konusu olan bir TYT konusu bul.
    const byTopic = new Map<string, any[]>();
    for (const t of fresh) {
      if (t.exam !== "TYT") continue;
      const k = `${t.subject}|${t.topic}`;
      byTopic.set(k, [...(byTopic.get(k) ?? []), t]);
    }
    const entry = [...byTopic.entries()].find(([, rows]) => rows.length >= 2);
    assert.ok(entry, "çoklu alt konulu TYT konusu bulunamadı");
    const [key, rows] = entry!;
    const [subject, topic] = key.split("|");

    const blockers = R.gateBlockers(rows, subject, [topic]);
    assert.equal(blockers.length, 1, "konu başına tek engel kaydı olmalı");
    const b = blockers[0];
    assert.equal(
      b.subtopics.length,
      rows.length,
      `beklenen ${rows.length} alt konu, gelen ${b.subtopics.length}`,
    );
    // Hiçbir alt konu atlanmamalı.
    const gotNames = b.subtopics.map((s: any) => s.name).sort();
    const expNames = rows.map((r: any) => r.subtopic).sort();
    assert.deepEqual(gotNames, expNames, "eksik alt konu atlandı");
    // Her alt konunun kendi gerekçesi olmalı.
    for (const s of b.subtopics) {
      assert.ok(s.reason && s.reason.length > 0, `gerekçe yok: ${s.name}`);
      assert.ok(s.stageLabel && s.stageLabel.length > 0, `etiket yok: ${s.name}`);
    }
  });

  it("bir alt konu öğrenildi, diğeri eksikse yalnızca eksik olanı gösterir", async () => {
    const S = await server.ssrLoadModule("/src/lib/store.ts");
    const fresh = S.seedTopics();
    const byTopic = new Map<string, any[]>();
    for (const t of fresh) {
      if (t.exam !== "TYT") continue;
      const k = `${t.subject}|${t.topic}`;
      byTopic.set(k, [...(byTopic.get(k) ?? []), t]);
    }
    const entry = [...byTopic.entries()].find(([, rows]) => rows.length >= 2);
    assert.ok(entry);
    const [key, rows] = entry!;
    const [subject, topic] = key.split("|");

    const mastered = { ...rows[0], status: "Bitti", total: 20, correct: 18, wrong: 2 };
    const input = [mastered, ...rows.slice(1)];
    const b = R.gateBlockers(input, subject, [topic])[0];
    assert.equal(b.subtopics.length, rows.length - 1, "yalnızca eksik alt konular listelenmeli");
    assert.ok(
      !b.subtopics.some((s: any) => s.name === mastered.subtopic),
      "öğrenilmiş alt konu engelde görünmemeli",
    );
  });

  it("engel sayısı alt konu sayısından bağımsız: konu başına 1", async () => {
    const S = await server.ssrLoadModule("/src/lib/store.ts");
    const fresh = S.seedTopics();
    const byTopic = new Map<string, any[]>();
    for (const t of fresh) {
      if (t.exam !== "TYT" || t.subject !== "Matematik") continue;
      byTopic.set(t.topic, [...(byTopic.get(t.topic) ?? []), t]);
    }
    const multi = [...byTopic.entries()].filter(([, rows]) => rows.length >= 2);
    if (!multi.length) return; // bu derste çoklu alt konu yoksa atla
    const names = multi.map(([topic]) => topic);
    const rows = multi.flatMap(([, r]) => r);
    const blockers = R.gateBlockers(rows, "Matematik", names);
    assert.equal(blockers.length, names.length, "her konu için tam 1 engel kaydı");
    const totalSubs = blockers.reduce((n: number, b: any) => n + b.subtopics.length, 0);
    assert.ok(totalSubs >= names.length, "alt konu toplamı konu sayısından az olamaz");
  });

  it("subtopics alanı geriye dönük alanları da doldurur", async () => {
    const S = await server.ssrLoadModule("/src/lib/store.ts");
    const fresh = S.seedTopics();
    const byTopic = new Map<string, any[]>();
    for (const t of fresh) {
      if (t.exam !== "TYT") continue;
      byTopic.set(`${t.subject}|${t.topic}`, [...(byTopic.get(`${t.subject}|${t.topic}`) ?? []), t]);
    }
    const [key, rows] = [...byTopic.entries()].find(([, r]) => r.length >= 2)!;
    const [subject, topic] = key.split("|");
    const b = R.gateBlockers(rows, subject, [topic])[0];
    // Eski arayüz alanları ilk alt konudan türetilmeli (kırılma olmasın).
    assert.equal(b.stage, b.subtopics[0].stage);
    assert.equal(b.stageLabel, b.subtopics[0].stageLabel);
    assert.equal(b.reason, b.subtopics[0].reason);
    assert.equal(b.correct, b.subtopics[0].correct);
    assert.equal(b.total, b.subtopics[0].total);
  });
});
