/**
 * "Programı bugünden yeniden planla" onay penceresi — davranış testleri.
 *
 * NEDEN: Bu işlem dondurulmuş program penceresini temizleyip bugünden itibaren
 * görevleri yeniden üretir. Kullanıcı bunu yalnızca fare ipucundan görmemeli.
 * Bu dosya iki katmanı sınar:
 *   1. `ReplanDialog` bileşeninin onay/iptal davranışı ve metni (sunumsal).
 *   2. Onaylandığında `replanProgram` aksiyonunun kullanıcı verisini koruduğu,
 *      vazgeçildiğinde ise hiçbir şeyin değişmediği (gerçek store).
 *
 * DOM kütüphanesi (jsdom) yok; bu yüzden bileşen doğrudan çağrılıp React eleman
 * ağacı gezilerek düğmelerin `onClick` davranışı doğrulanır. Ağaç gezinme,
 * gerçek bir tıklamanın tetikleyeceği aynı işleyicileri çalıştırır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let ReplanDialog: any;
let S: any, T: any, DEFAULT_SETTINGS: any;

const FAKE_TODAY = "2026-11-17";
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(FAKE_TODAY + "T12:00:00");
    else super(args[0]);
  }
  static now() {
    return new RealDate(FAKE_TODAY + "T12:00:00").getTime();
  }
}

before(async () => {
  (globalThis as any).Date = FakeDate as any;
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  const M = await server.ssrLoadModule("/src/components/replan-dialog.tsx");
  ReplanDialog = M.ReplanDialog;
  S = await server.ssrLoadModule("/src/lib/store.ts");
  T = await server.ssrLoadModule("/src/lib/smart/types.ts");
  DEFAULT_SETTINGS = T.DEFAULT_SETTINGS;
});

after(async () => {
  (globalThis as any).Date = RealDate;
  await server?.close();
});

const st = () => S.useAppStore.getState();

/** React eleman ağacındaki tüm düğüm metnini toplar. */
function textOf(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props) return textOf(node.props.children);
  return "";
}

/** Ağaçta `onClick` taşıyan elemanları (etiket metniyle birlikte) toplar. */
function buttons(node: any, out: { text: string; onClick: () => void }[] = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((c) => buttons(c, out));
    return out;
  }
  const props = node.props ?? {};
  if (typeof props.onClick === "function") {
    out.push({ text: textOf(props.children).trim(), onClick: props.onClick });
  }
  buttons(props.children, out);
  return out;
}

function renderDialog(open: boolean, onCancel: () => void, onConfirm: () => void) {
  return ReplanDialog({ open, onCancel, onConfirm });
}

describe("ReplanDialog — onay penceresi içeriği", () => {
  it("(1) kapalıyken hiçbir şey render etmez", () => {
    const el = renderDialog(false, () => {}, () => {});
    assert.equal(el, null);
  });

  it("(2) açıkken başlık ve iki düğme gösterir", () => {
    const el = renderDialog(true, () => {}, () => {});
    const btns = buttons(el).map((b) => b.text);
    assert.deepEqual(btns, ["Vazgeç", "Yeniden planla"]);
  });

  it("(3) metin bugünden itibaren yeniden oluşturmayı açıkça belirtir", () => {
    const text = textOf(renderDialog(true, () => {}, () => {}));
    assert.match(text, /Bugünden itibaren program görevleri yeniden oluşturulacak/);
    assert.match(text, /tarihleri veya sırası değişebilir/);
  });

  it("(4) metin konu ilerlemesi, soru sonuçları, yanlışlar ve denemelerin korunduğunu belirtir", () => {
    const text = textOf(renderDialog(true, () => {}, () => {}));
    assert.match(text, /Konu ilerlemen/);
    assert.match(text, /soru sonuçların/);
    assert.match(text, /yanlışların/);
    assert.match(text, /denemelerin korunur/);
  });

  it("(5) erişilebilirlik: dialog rolü ve aria-modal taşır", () => {
    const el = renderDialog(true, () => {}, () => {});
    assert.equal(el.props.role, "dialog");
    assert.equal(el.props["aria-modal"], "true");
    assert.equal(el.props["aria-labelledby"], "replan-dialog-title");
  });
});

describe("ReplanDialog — onay / iptal davranışı", () => {
  it("(6) Vazgeç: yalnızca onCancel çağrılır, onConfirm çağrılmaz", () => {
    let cancelled = 0;
    let confirmed = 0;
    const el = renderDialog(true, () => cancelled++, () => confirmed++);
    const vazgec = buttons(el).find((b) => b.text === "Vazgeç")!;
    vazgec.onClick();
    assert.equal(cancelled, 1);
    assert.equal(confirmed, 0);
  });

  it("(7) Yeniden planla: yalnızca onConfirm çağrılır, onCancel çağrılmaz", () => {
    let cancelled = 0;
    let confirmed = 0;
    const el = renderDialog(true, () => cancelled++, () => confirmed++);
    const onay = buttons(el).find((b) => b.text === "Yeniden planla")!;
    onay.onClick();
    assert.equal(confirmed, 1);
    assert.equal(cancelled, 0);
  });
});

/** Store'u temiz bir başlangıç durumuna getirir; aksiyonlar korunur. */
function resetStore(programStart: string) {
  S.useAppStore.setState({
    topics: S.seedTopics(),
    archivedTopics: [],
    wrongs: [],
    tytExams: [],
    aytExams: [],
    daily: [],
    settings: { ...DEFAULT_SETTINGS, programStart },
    carry: [],
    analyzedWrongs: {},
    branchMockHistory: {},
    frozenPlan: {},
    frozenPlanFrom: "",
    backup: null,
    lastAiComment: null,
  });
}

/** Kullanıcı verisinin imzası (dondurma işleminden etkilenmemeli). */
const userDataSig = () => {
  const s = st();
  return JSON.stringify({
    topics: s.topics,
    wrongs: s.wrongs,
    tytExams: s.tytExams,
    aytExams: s.aytExams,
    daily: s.daily,
    carry: s.carry,
  });
};

describe("ReplanDialog — store entegrasyonu (onay/iptal)", () => {
  it("(8) iptal: hiçbir veri veya plan değişmez", () => {
    resetStore("2026-11-01");
    st().ensurePlan();
    const before = {
      settings: JSON.stringify(st().settings),
      frozen: JSON.stringify(st().frozenPlan),
      frozenFrom: st().frozenPlanFrom,
      user: userDataSig(),
    };

    // Kullanıcı diyaloğu açar ve "Vazgeç"e basar: onConfirm çağrılmaz.
    let confirmed = 0;
    const el = renderDialog(true, () => {}, () => confirmed++);
    buttons(el).find((b) => b.text === "Vazgeç")!.onClick();

    assert.equal(confirmed, 0);
    assert.equal(JSON.stringify(st().settings), before.settings);
    assert.equal(JSON.stringify(st().frozenPlan), before.frozen);
    assert.equal(st().frozenPlanFrom, before.frozenFrom);
    assert.equal(userDataSig(), before.user);
  });

  it("(9) onay: replanProgram çalışır, pencere temizlenir, kullanıcı verisi korunur", () => {
    resetStore("2026-11-01");
    st().ensurePlan();
    const windowDays = Object.keys(st().frozenPlan).length;
    assert.ok(windowDays > 0, "başlangıçta pencere üretilmeli");
    const userBefore = userDataSig();

    // Kullanıcı "Yeniden planla"ya basar: program.tsx'teki onConfirm gövdesi.
    const el = renderDialog(
      true,
      () => {},
      () => {
        st().replanProgram();
      },
    );
    buttons(el).find((b) => b.text === "Yeniden planla")!.onClick();

    // Pencere temizlendi (bugünden yeniden kurulacak) ve çıpa bugüne çekildi.
    assert.deepEqual(st().frozenPlan, {});
    assert.equal(st().frozenPlanFrom, "");
    assert.equal(st().settings.programStart, FAKE_TODAY);
    // Kullanıcı verisi aynen duruyor.
    assert.equal(userDataSig(), userBefore);

    // Yeniden planla sonrası `ensurePlan` yeni pencereyi bugünden kurar.
    st().ensurePlan();
    assert.ok(Object.keys(st().frozenPlan).length > 0);
  });

  it("(10) onay sonrası görevler bugünden başlar (dün için görev üretilmez)", () => {
    resetStore("2026-11-01");
    st().ensurePlan();
    st().replanProgram();
    st().ensurePlan();
    const dates = Object.keys(st().frozenPlan).sort();
    assert.equal(dates[0], FAKE_TODAY);
  });
});
