import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthBadge } from "@/components/ui/badge";
import { Kpi } from "@/components/kpi";
import { useAppStore } from "@/lib/store";
import { aytMockReady, aytUnlocks, gateBlockers, GATE_DEFS, lastExamNet, ROADMAP_PHASES, tytMockReady } from "@/data/roadmap";
import { buildDailyPlan, buildWeekGrid, planPace, weeklyBlueprint } from "@/lib/smart/engine";
import { phaseFor } from "@/data/sequence";
import { PLANNING_BANDS_NOTE, SOURCES, SOURCES_CHECKED_AT, TARGETS } from "@/data/targets";
import { formatDate, formatNet, todayISO } from "@/lib/utils";
import type { ScheduleSettings } from "@/lib/smart/types";

export const Route = createFileRoute("/program")({ component: ProgramPage });

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function ProgramPage() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const wrongs = useAppStore((s) => s.wrongs);
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const settings = useAppStore((s) => s.settings);
  const carry = useAppStore((s) => s.carry);
  const analyzedWrongs = useAppStore((s) => s.analyzedWrongs);
  const markWrongsAnalyzed = useAppStore((s) => s.markWrongsAnalyzed);
  const branchMockHistory = useAppStore((s) => s.branchMockHistory);
  const markBranchMock = useAppStore((s) => s.markBranchMock);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const missYesterday = useAppStore((s) => s.missYesterday);
  const clearCarry = useAppStore((s) => s.clearCarry);
  const replanProgram = useAppStore((s) => s.replanProgram);
  const { slots, life, analyzedWrongIds, branchMockSubject } = buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, settings, carry, todayISO(), undefined, analyzedWrongs, branchMockHistory);
  // Yanlış analizi görevleri üretildikten sonra kayıtları "analiz edildi" olarak
  // işaretle; böylece ertesi gün aynı yanlış için mükerrer görev oluşmaz.
  useEffect(() => {
    if (analyzedWrongIds.length) markWrongsAnalyzed(analyzedWrongIds, todayISO());
    if (branchMockSubject) markBranchMock(branchMockSubject, todayISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzedWrongIds.join(","), branchMockSubject]);
  const week = weeklyBlueprint(topics, daily, wrongs, settings);
  const timeline = [...slots, ...life].sort((a, b) => a.start.localeCompare(b.start));
  const unlock = aytUnlocks(topics);
  const gateNames = Object.fromEntries(GATE_DEFS.map((g) => [g.subject, g.names]));
  const MAT_NAMES = gateNames["Matematik"];
  const FIZ_NAMES = gateNames["Fizik"];
  const KIM_NAMES = gateNames["Kimya"];
  const nets = lastExamNet(tytExams, aytExams);
  const tytReady = tytMockReady(topics, tytExams);
  const aytReady = aytMockReady(topics, tytExams, aytExams);
  const weekGrid = buildWeekGrid(topics, daily, wrongs, tytExams, aytExams, settings, carry);
  const pace = planPace(topics, settings);
  const phaseId = phaseFor(pace.timeline, todayISO()).id;
  const sunday = new Date().getDay() === 0;
  const beforeStart = settings.programStart > todayISO();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Akıllı program</p>
        <h1 className="mt-1 text-3xl font-semibold">Günlük ve haftalık plan</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Başlangıç {formatDate(pace.start)}. Sınava {pace.daysLeft} gün var ({pace.studyDays} çalışma günü, pazarlar hariç). Bu tempoda günde {pace.perDay} yeni konu. Daha geç başlarsan kalan gün azalır, günlük yük artar.
        </p>
        <p className={`mt-2 text-sm ${pace.fits ? "text-muted" : "text-warn"}`}>
          {pace.fits
            ? `Yeni konu penceresi: ${pace.teachingDays} gün, kapasite ${pace.capacity} konu. Kalan ${pace.leftTopics} konu sığıyor.`
            : `Uyarı: yeni konu penceresi ${pace.teachingDays} gün, kapasite ${pace.capacity} konu ama ${pace.leftTopics} konu kaldı. Günlük ders süresini artır ya da programı öne çek.`}
        </p>
        <p className="mt-1 text-sm text-muted">
          TYT tek başına: {pace.tytLeft} konu kaldı, günde {pace.perDay} konu ile yaklaşık {pace.tytStudyDays} çalışma günü. Tahmini bitiş {formatDate(pace.tytEta)}. Bu, AYT kapıları kapalıyken TYT'ye ağırlık verildiği varsayımıdır; deneme ve tekrar bu sürenin içindedir.
        </p>
      </div>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Faz takvimi</h2>
        <p className="mt-1 text-sm text-muted">
          Program başlangıçtan sınava kadar beş faza bölünür. Son iki haftada yeni konu açılmaz; tekrar ve deneme kalır.
        </p>
        <ol className="mt-4 grid gap-2 lg:grid-cols-5">
          {pace.timeline.map((p) => {
            const active = phaseId === p.id;
            return (
              <li
                key={p.id}
                className={`rounded-[var(--radius-md)] border p-3 ${active ? "border-primary bg-bg-elevated" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium">{p.title}</span>
                  {active ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-fg">şimdi</span> : null}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {formatDate(p.from)} – {formatDate(p.to)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {p.newTopics ? "yeni konu açık" : "yeni konu kapalı"}
                  {p.mockIntensity >= 2 ? " · deneme haftada iki" : p.mockIntensity >= 1 ? " · deneme haftada bir" : ""}
                </div>
                <p className="mt-2 text-xs leading-snug">{p.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">TYT ne kadar sürer</h2>
        <p className="mt-1 text-sm text-muted">
          TYT'de {pace.tytLeft} konu var. Günde kaç yeni konu çalıştığına göre bitiş tarihi değişir; pazar günü sayılmaz.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {pace.tytScenarios.map((s) => (
            <div
              key={s.per}
              className={`rounded-[var(--radius-md)] border p-3 ${s.per === pace.perDay ? "border-primary bg-bg-elevated" : "border-border"}`}
            >
              <div className="text-xs text-muted">Günde {s.per} yeni konu</div>
              <div className="mt-1 text-lg font-semibold">{formatDate(s.eta)}</div>
              <div className="mt-1 text-xs text-muted">{s.studyDays} çalışma günü</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Gerçekçi beklenti: konu anlatımı + soru çözümü + tekrar aynı güne sığdığı için günde 1–2 konu en sürdürülebilir tempodur.
          Günde 3 konu kısa vadede hızlıdır ama tekrar yükü birikir. AYT'ye geçmek için TYT'yi bitirmek şart değildir; matematik, fizik ve kimya kapıları açılınca AYT başlar.
        </p>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Hızlı yol ve kapılar</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Gate title="AYT Mat / Geo" ready={unlock.mat.ready} detail={`${unlock.mat.done}/${unlock.mat.total} TYT sayı çekirdeği`} blockers={gateBlockers(topics, "Matematik", MAT_NAMES)} />
          <Gate title="AYT Fizik" ready={unlock.fiz.ready} detail={`${unlock.fiz.done}/${unlock.fiz.total} TYT fizik kapısı`} blockers={gateBlockers(topics, "Fizik", FIZ_NAMES)} />
          <Gate title="AYT Kimya" ready={unlock.kim.ready} detail={`${unlock.kim.done}/${unlock.kim.total} TYT kimya kapısı`} blockers={gateBlockers(topics, "Kimya", KIM_NAMES)} />
          <Gate title="AYT Biyoloji" ready={unlock.bio.ready} detail={unlock.bio.allDone ? "TYT biyoloji bitti" : unlock.bio.fast ? "Hızlı geçiş (kalıtım bekleyebilir)" : "TYT biyolojiyi bitirmek daha iyi"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-muted">
            TYT deneme: {tytReady ? "açık" : "çekirdek matematiğin ~%40’ı bitince"}.
            {nets.tyt != null ? ` Son TYT net ${nets.tyt.toFixed(1)}.` : " Henüz deneme kaydı yok."}
          </p>
          <p className="text-sm text-muted">
            AYT deneme: {aytReady ? "açık (TYT 70+ ve kapı var)" : "son TYT net 70+ ve ilgili kapı açık olunca"}.
            {nets.ayt != null ? ` Son AYT net ${nets.ayt.toFixed(1)}.` : ""}
          </p>
        </div>
        {sunday ? <p className="mt-2 text-sm">Bugün pazar — süre yarıya iner, yeni konu yok, tekrar ve paragraf kalır.</p> : null}
        <ol className="mt-4 space-y-2 text-sm text-muted">
          {ROADMAP_PHASES.map((p) => (
            <li key={p.id}>
              <span className="font-medium text-fg">{p.title}.</span> {p.body}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Önümüzdeki 7 gün</h2>
        <p className="mt-1 text-sm text-muted">
          {beforeStart
            ? `Bugün program günü değil. İlk gün ${formatDate(pace.start)}.`
            : "Bugünden itibaren. Pazar hafif. Deneme, hazır olunca cumartesi."}
          {" "}Sıfırlarsan başlangıç sıfırladığın güne alınır ve kalan süre yeniden hesaplanır.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {weekGrid.map((d) => (
            <div
              key={d.date}
              className={`rounded-[var(--radius-md)] border p-2 ${d.today ? "border-primary bg-bg-elevated" : "border-border"}`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-sm font-medium">{DAYS[d.weekday]}</span>
                <span className="text-xs text-muted">{d.date.slice(8)}.{d.date.slice(5, 7)}</span>
              </div>
              {d.light ? <div className="mt-1 text-xs text-muted">hafif gün</div> : null}
              {d.startDay ? <div className="mt-1 text-xs text-muted">başlangıç</div> : null}
              <ul className="mt-2 space-y-1">
                {d.slots.length === 0 ? (
                  <li className="text-xs text-muted">Boş</li>
                ) : (
                  d.slots.map((s) => (
                    <li key={s.id} className="text-xs leading-snug">
                      <span className="text-muted">{s.start}</span> {s.topic}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={missYesterday}>
          Dünü kaçırdım (yay)
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => replanProgram()}
          disabled={settings.programStart === todayISO()}
          title="Programı bugünden yeniden planlar. Konu ve deneme kayıtları korunur."
        >
          Programı bugünden yeniden planla
        </Button>
        {carry.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearCarry}>
            Devirleri temizle ({carry.reduce((a, c) => a + c.minutes, 0)} dk)
          </Button>
        ) : null}
      </div>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Bugünün sırası</h2>
        <ol className="mt-3 space-y-2">
          {timeline.map((s) => (
            <li
              key={s.id}
              className={`rounded-[var(--radius-md)] border px-3 py-2 ${s.life ? "border-border bg-bg-elevated text-muted" : "border-border bg-surface"}`}
            >
              <span className="tabular-nums font-medium">{s.start}–{s.end}</span>
              <span className="ml-2">{s.life ? s.topic : `${s.exam} ${s.subject} — ${s.topic}`}</span>
              {!s.life ? (
                <span className="ml-2 text-xs text-muted">
                  {s.kind} · {s.minutes} dk {s.targetQ ? `· ${s.targetQ} soru` : ""} · {s.priority}
                </span>
              ) : (
                <span className="ml-2 text-xs">korunan blok</span>
              )}
              {!s.life ? <div className="text-xs text-muted">{s.reason}</div> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Hedef takvimi</h2>
        <p className="mt-1 text-sm text-muted">
          Fazlar bu tarihlere çapalanır. TYT önce bitmeli; AYT dersleri kapı konuları bittikçe açar.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="TYT ilk tur hedefi" value={formatDate(TARGETS.tytRound1)} />
          <Kpi label="AYT ilk tur hedefi" value={formatDate(TARGETS.aytRound1)} />
          <Kpi label="Eksik kapatma" value={formatDate(TARGETS.gapFill)} />
          <Kpi label="Sınav" value={formatDate(TARGETS.tytExam)} />
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {pace.timeline.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{p.title}</span>
              <span className="text-muted">
                {formatDate(p.from)} – {formatDate(p.to)}
              </span>
              <span className="text-xs text-muted">
                {p.newTopics ? "yeni konu açık" : "yeni konu kapalı"} · deneme yoğunluğu {p.mockIntensity}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Kalan yeni konu" value={pace.leftTopics} />
          <Kpi label="TYT kalan" value={pace.tytLeft} />
          <Kpi label="TYT günlük tempo" value={pace.tytPerDay} />
          <Kpi label="AYT günlük tempo" value={pace.aytPerDay} />
        </div>
        <p className="mt-3 text-sm text-muted">
          TYT tahmini bitiş: {formatDate(pace.tytEta)} · Öğretim günü: {pace.teachingDays} · Kapasite: {pace.capacity}
        </p>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Haftalık çerçeve</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="7 gün süre (dk)" value={week.week.minutes} />
          <Kpi label="7 gün soru" value={week.week.questions} />
          <Kpi label="7 gün net" value={formatNet(week.week.net)} />
          <Kpi label="Kayıt" value={week.week.count} />
        </div>
        <h3 className="mt-5 text-sm font-medium">Öncelikli konular</h3>
        <ul className="mt-2 space-y-2">
          {week.focus.map((f) => (
            <li key={`${f.exam}-${f.topic}`} className="flex flex-wrap items-center gap-2 text-sm">
              <HealthBadge health={f.health} />
              <span>
                {f.exam} {f.subject} — {f.topic}
              </span>
              <span className="text-xs text-muted">{f.reasons[0]}</span>
            </li>
          ))}
        </ul>
        {week.weakest ? (
          <p className="mt-4 text-sm text-muted">
            En zayıf ölçülen alan: {week.weakest.exam} {week.weakest.subject} — {week.weakest.topic}
            {week.nextWeekExtra ? ` · Gelecek hafta ek ağırlık: ${week.nextWeekExtra}` : ""}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted">Haftalık zayıf alan için henüz yeterli soru yok.</p>
        )}
        <p className="mt-2 text-sm text-muted">
          Bu hafta {week.hoursLabel} çalışıldı (hedef {week.weeklyTargetHours} saat) · {week.week.questions} soru · {week.finishedThisWeek} konu bitirildi
          {week.overdue ? ` · ${week.overdue} tekrar gecikti` : ""}.
          Kaçırılan gün yarına yığılmaz; “Dünü kaçırdım” ile sonraki günlere yayılır.
        </p>
      </section>

      <SettingsForm settings={settings} onChange={updateSettings} />

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Plan kararlarının kaynakları</h2>
        <p className="mt-1 text-sm text-muted">
          Son kontrol: {formatDate(SOURCES_CHECKED_AT)}. Kaynağın ne dediği ve bu programda ne için
          kullanıldığı ayrı yazılı.
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {SOURCES.map((s) => (
            <li key={s.id} className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <a
                  className="font-medium underline decoration-dotted hover:text-accent"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.title}
                </a>
                <span className="text-xs text-muted">{s.publisher}</span>
                <span className="rounded-[var(--radius-xs)] border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {s.strength}
                </span>
              </div>
              <p className="mt-1 text-muted">{s.finding}</p>
              <p className="mt-1 text-xs text-muted">Bu programda: {s.usedFor}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-[var(--radius-md)] border border-border bg-bg p-3 text-xs text-muted">
          {PLANNING_BANDS_NOTE}
        </p>
      </section>
    </div>
  );
}

function SettingsForm({
  settings,
  onChange,
}: {
  settings: ScheduleSettings;
  onChange: (p: Partial<ScheduleSettings>) => void;
}) {
  const toggleDay = (key: "mockWeekdays" | "sportDays", d: number) => {
    const cur = settings[key];
    onChange({ [key]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] });
  };
  return (
    <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">Program ayarları</h2>
      <p className="mt-1 text-sm text-muted">Uyanma, uyku, spor ve serbest zaman dersin üzerine yazılmaz.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Uyanma"><Input type="time" value={settings.wake} onChange={(e) => onChange({ wake: e.target.value })} /></Field>
        <Field label="Uyuma"><Input type="time" value={settings.sleep} onChange={(e) => onChange({ sleep: e.target.value })} /></Field>
        <Field label="Günlük ders (dk)"><Input type="number" value={settings.studyMinutes} onChange={(e) => onChange({ studyMinutes: Number(e.target.value) })} /></Field>
        <Field label="Haftalık hedef (saat)"><Input type="number" value={settings.weeklyHours} onChange={(e) => onChange({ weeklyHours: Number(e.target.value) })} /></Field>
        <Field label="Hedef sınav"><Input type="date" value={settings.examDate} onChange={(e) => onChange({ examDate: e.target.value })} /></Field>
        <Field label="Program başlangıcı"><Input type="date" value={settings.programStart} onChange={(e) => onChange({ programStart: e.target.value })} /></Field>
        <Field label="Günlük paragraf"><Input type="number" value={settings.paragraphTarget} onChange={(e) => onChange({ paragraphTarget: Number(e.target.value) })} /></Field>
        <Field label="Günlük problem"><Input type="number" value={settings.problemTarget} onChange={(e) => onChange({ problemTarget: Number(e.target.value) })} /></Field>
        <Field label="Spor saati">
          <div className="flex gap-2">
            <Input type="time" value={settings.sportStart} onChange={(e) => onChange({ sportStart: e.target.value })} />
            <Input type="time" value={settings.sportEnd} onChange={(e) => onChange({ sportEnd: e.target.value })} />
          </div>
        </Field>
      </div>
      <div className="mt-4">
        <div className="text-xs font-medium text-muted">Deneme günleri</div>
        <DayToggles selected={settings.mockWeekdays} onToggle={(d) => toggleDay("mockWeekdays", d)} />
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium text-muted">Spor günleri</div>
        <DayToggles selected={settings.sportDays} onToggle={(d) => toggleDay("sportDays", d)} />
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-xs font-medium text-muted">Yemekler</div>
        {settings.meals.map((m, i) => (
          <div key={m.name} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm">{m.name}</span>
            <Input className="w-32" type="time" value={m.start} onChange={(e) => {
              const meals = settings.meals.map((x, j) => (j === i ? { ...x, start: e.target.value } : x));
              onChange({ meals });
            }} />
            <Input className="w-32" type="time" value={m.end} onChange={(e) => {
              const meals = settings.meals.map((x, j) => (j === i ? { ...x, end: e.target.value } : x));
              onChange({ meals });
            }} />
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-xs font-medium text-muted">Serbest zaman (oyun, dizi, YouTube, dinlenme)</div>
        {settings.leisure.map((l, i) => (
          <div key={l.name} className="space-y-1 rounded-[var(--radius-md)] border border-border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-36 text-sm">{l.name}</span>
              <Input className="w-32" type="time" value={l.start} onChange={(e) => {
                const leisure = settings.leisure.map((x, j) => (j === i ? { ...x, start: e.target.value } : x));
                onChange({ leisure });
              }} />
              <Input className="w-32" type="time" value={l.end} onChange={(e) => {
                const leisure = settings.leisure.map((x, j) => (j === i ? { ...x, end: e.target.value } : x));
                onChange({ leisure });
              }} />
            </div>
            <DayToggles
              selected={l.days}
              onToggle={(d) => {
                const leisure = settings.leisure.map((x, j) =>
                  j === i ? { ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d] } : x,
                );
                onChange({ leisure });
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Gate({
  title,
  ready,
  detail,
  blockers,
}: {
  title: string;
  ready: boolean;
  detail: string;
  blockers?: {
    topic: string;
    stageLabel: string;
    reason: string;
    correct: number;
    total: number;
    subtopics: { name: string; stageLabel: string; reason: string; correct: number; total: number }[];
  }[];
}) {
  const [open, setOpen] = useState(false);
  const subtopicCount = (blockers ?? []).reduce((n, b) => n + Math.max(b.subtopics.length, 1), 0);
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
      <div className="text-xs text-muted">{title}</div>
      <div className="mt-1 text-sm font-medium">{ready ? "Açık" : "Kapalı"}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
      {!ready && blockers && blockers.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-xs font-medium underline underline-offset-2"
          >
            Kapatan {blockers.length} konu / {subtopicCount} alt konu {open ? "▲" : "▼"}
          </button>
          {open ? (
            <ul className="mt-2 space-y-1.5 text-xs">
              {blockers.map((b) => (
                <li key={b.topic} className="border-l-2 border-amber-400 pl-2">
                  <div className="font-medium">{b.topic}</div>
                  {b.subtopics.length > 1 ? (
                    <ul className="mt-1 space-y-1">
                      {b.subtopics.map((s) => (
                        <li key={s.name} className="border-l border-border pl-2">
                          <div>{s.name}</div>
                          <div className="text-muted">{s.stageLabel}</div>
                          <div className="text-muted">{s.reason}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <div className="text-muted">{b.stageLabel}</div>
                      <div className="text-muted">{b.reason}</div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function DayToggles({ selected, onToggle }: { selected: number[]; onToggle: (d: number) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {DAYS.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onToggle(i)}
          className={`h-8 rounded-[var(--radius-sm)] px-2 text-xs ${selected.includes(i) ? "bg-primary text-primary-fg" : "border border-border bg-surface"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
