import { Link } from "@tanstack/react-router";
import { HealthBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { buildDailyPlan, buildInsights, dueReviews, rankTopics } from "@/lib/smart/engine";
import { formatPct, todayISO, formatDate } from "@/lib/utils";
import { requestAiComment } from "@/lib/ai-comment";

export function TodayPlanPanel() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const wrongs = useAppStore((s) => s.wrongs);
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const settings = useAppStore((s) => s.settings);
  const carry = useAppStore((s) => s.carry);
  const { slots } = buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, settings, carry);

  return (
    <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Bugün ne yapmalıyım?</p>
          <h2 className="mt-1 text-xl font-semibold">Bugünün planı</h2>
        </div>
        <Link to="/program" className="text-sm text-primary hover:underline">
          Program ve ayarlar
        </Link>
      </div>
      {slots.length === 0 ? (
        <p className="text-sm text-muted">
          {settings.programStart && todayISO() < settings.programStart
            ? `Program ${formatDate(settings.programStart)} tarihinde başlıyor. Bugün ders günü sayılmıyor; kalan gün sayısı o tarihten hesaplanır.`
            : "Konu, yanlış veya deneme verisi girdikçe burası dolar. Spor / yemek / serbest zaman blokları korunur."}
        </p>
      ) : (
        <ol className="space-y-2">
          {slots.map((s) => (
            <li key={s.id} className="rounded-[var(--radius-md)] border border-border bg-bg-elevated px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium tabular-nums">
                  {s.start}–{s.end}
                  <span className="ml-2 font-normal text-fg">
                    {s.exam ? `${s.exam} ${s.subject}` : s.subject} — {s.topic}
                  </span>
                </div>
                <span className="text-xs text-muted">
                  {s.kind} · {s.minutes} dk{s.targetQ ? ` · ${s.targetQ} soru` : ""} · {s.priority}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{s.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ReviewTodayPanel() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const reviews = dueReviews(topics, daily);

  return (
    <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-lg font-semibold">Bugün tekrar etmen gerekenler</h2>
      {reviews.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Zorunlu tekrar yok. Konu çalıştıkça aralıklar performansa göre ayarlanır.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reviews.map((r) => (
            <li key={`${r.exam}-${r.subject}-${r.topic}`} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2">
              <HealthBadge health={r.health} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {r.exam} {r.subject} — {r.topic}
                </div>
                <div className="text-xs text-muted">{r.reason}</div>
              </div>
              <div className="text-xs tabular-nums text-muted">{r.suggestedQ} soru</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SmartAdvicePanel() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const wrongs = useAppStore((s) => s.wrongs);
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const settings = useAppStore((s) => s.settings);
  const insights = buildInsights(topics, daily, wrongs, tytExams, aytExams, settings);
  const ranked = rankTopics(topics, daily, wrongs);
  const cards = ranked.filter((r) => r.total > 0 || r.status !== "Başlamadım").slice(0, 4);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.length === 0 ? (
          <p className="text-sm text-muted lg:col-span-2">
            Konu, yanlış veya deneme kaydı girince öneri kartları burada oluşur. Veri yokken yorum uydurulmaz.
          </p>
        ) : null}
        {cards.map((c) => (
          <article key={`${c.exam}-${c.topic}`} className="nd-card rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Akıllı öneri</div>
            <div className="mt-1 flex items-center gap-2">
              <HealthBadge health={c.health} />
              <h3 className="font-medium">
                {c.exam} {c.subject} — {c.topic}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted">
              {c.success != null ? `Başarı ${formatPct(c.success)} · ` : ""}
              {c.total ? `${c.total} soru · ` : ""}
              {c.lastStudy ? `son çalışma ${c.lastStudy}` : "henüz tarih yok"}
            </p>
            <p className="mt-2 text-sm">
              {c.health === "iyi"
                ? "İstikrarlı. Tekrar aralığını uzat; yeni konuya geçebilirsin. Paragraf/problem ise pratik dursun."
                : c.health === "kritik" || c.health === "zayif"
                  ? "Bugün veya yarın tekrar + ek soru. Sadece yüzdeye bakılmadı; sıklık ve recency de var."
                  : "Normal aralıkta tut. Veri azsa önce 15–20 soru ile ölç."}
            </p>
            {c.reasons[0] ? <p className="mt-1 text-xs text-subtle">Gerekçe: {c.reasons.join(" · ")}</p> : null}
          </article>
        ))}
      </div>
      {insights.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-border bg-bg-elevated p-4">
          <h3 className="font-semibold">Veriye dayalı notlar</h3>
          <ul className="mt-2 space-y-3">
            {insights.map((i) => (
              <li key={i.id}>
                <div className="text-sm font-medium">{i.title}</div>
                <p className="text-sm text-muted">{i.body}</p>
                <p className="text-[11px] text-subtle">Kaynak: {i.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function AiCommentButton() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const wrongs = useAppStore((s) => s.wrongs);
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const settings = useAppStore((s) => s.settings);
  const last = useAppStore((s) => s.lastAiComment);
  const setAiComment = useAppStore((s) => s.setAiComment);
  const insights = buildInsights(topics, daily, wrongs, tytExams, aytExams, settings);

  async function run() {
    const data = await requestAiComment({ data: { facts: insights, today: todayISO() } });
    if (data.ok && data.text) setAiComment(data.text);
    else setAiComment(("error" in data ? data.error : null) || "Yorum üretilemedi. Sayısal öneriler yine de geçerli.");
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Kısa performans yorumu</h3>
          <p className="text-xs text-muted">Sayılar formülle hesaplanır. Bu düğme sadece mevcut özeti cümleye döker; veri yoksa uydurmaz.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void run()}>
          Yorumla
        </Button>
      </div>
      {last ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{last.text}</p> : null}
    </div>
  );
}
