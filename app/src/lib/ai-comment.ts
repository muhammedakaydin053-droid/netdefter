import { createServerFn } from "@tanstack/react-start";

type Fact = { title: string; body: string; evidence: string };

export const requestAiComment = createServerFn({ method: "POST" })
  .validator((input: { facts: Fact[]; today: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "Yorum servisi bu ortamda kapalı. Formül önerileri çalışmaya devam eder." };
    }
    if (!data.facts.length) {
      return { ok: false as const, error: "Yorum için yeterli kayıt yok. Önce konu, deneme veya günlük veri gir." };
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              "YKS koçusun. Sadece verilen olguları yorumla. Yeni sayı uydurma. 4-6 kısa Türkçe cümle. Sürdürülebilir tempo, yığmadan tekrar, paragraf/problem pratiğini koru.",
          },
          {
            role: "user",
            content: `Tarih: ${data.today}\nOlgular:\n${data.facts.map((f) => `- ${f.title}: ${f.body} (${f.evidence})`).join("\n")}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Yorum alınamadı (${res.status})` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "" };
  });
