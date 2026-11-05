# NetDefter — Bağımsız Denetim Raporu

Denetçi: OpenHands (bu oturum, gerçek terminal erişimiyle)
Tarih: 2026-10-31
Kapsam: `/workspace/project/app` — planlama motoru, veri saklama, takvim,
müfredat, kapı mantığı, deneme sistemi.

Bu rapor **çalıştırılmış komutların gerçek çıktılarına** dayanır. Tüm kanıt
dökümü: `KANIT-loglari.txt`. Ham veriler: `ZIP-icerigi.txt`, kaynak arşivi
`netdefter-kaynak.zip`.

**Önemli:** Bu denetim sırasında **iki düzeltme yapıldı** (Bulgular bölümünde
açıkça işaretli). Bunların dışında hiçbir dosya değiştirilmedi. Yapılan
değişiklikler Git geçmişinde tek tek görülebilir.

---

## 1. Yönetici özeti

Sistem genel olarak sağlam: testler geçiyor, tip kontrolü temiz, lint temiz,
derleme başarılı, takvim çakışması yok, veri koruma mantığı doğru çalışıyor.
Ancak **bir tanesi ciddi** olmak üzere üç gerçek hata buldum.

| # | Bulgu | Önem | Durum |
| --- | --- | --- | --- |
| B1 | Öğrenme eşiği tutarsız: 14/14 doğru "öğrenilmedi", 14/20 "öğrenildi" sayılıyor | **Yüksek** | Açık |
| B2 | Veri koruma fonksiyonunun (`mergeTopics`) hiç testi yoktu | Orta | Düzeltildi (test eklendi) |
| B3 | Kullanılmayan import (`n`) lint uyarısı üretiyordu | Düşük | Düzeltildi |

Ayrıca GPT-6'nın sorduğu bir konuda **kendi şüphemi geri çektim** (bkz. Bölüm 5)
ve B1 için ek inceleme yaptım (bkz. Bölüm 9). B1 için **hiçbir davranış
değişikliği yapılmadı** — karar bekliyor.

---

## 2. Çalıştırılan komutlar ve sonuçları

| Komut | Sonuç | Kanıt |
| --- | --- | --- |
| `npm test` | 149 + 83 test, **hepsi geçti** | `KANIT-loglari.txt` |
| `npm run test:plan` | 11 test, hepsi geçti | aynı |
| `npx tsc --noEmit` | çıktı yok (temiz) | aynı |
| `npm run lint` | temiz (düzeltme sonrası) | aynı |
| `npm run build` | başarılı, EXIT=0 | aynı |

Not: Test sayısı başlangıçta 78'di, bu denetimde eklenen 5 veri koruma testiyle
83 oldu. `npm test` çıktısının ham hali `KANIT-loglari.txt` içinde.

`npm run build` **bir uyarı** veriyor (hata değil): bazı parçalar 500 kB'ın
üzerinde. Tek kullanıcılı yerel uygulamada performans sorunu değil; kayda
geçiriyorum, düzeltme gerekmez.

---

## 3. Bulgular

### B1 — Öğrenme eşiği tutarsız (YÜKSEK)

**Yer:** `app/src/lib/smart/progress.ts:37-41`

**Ne yanlış:** "Bitti" durumundaki bir konu, öğrenilmiş sayılmak için
`total >= 15` şartını arıyor. Bu şart, konunun *başarısına* değil *soru
sayısına* bakıyor. Sonuç:

```
10/10 doğru -> temel-soru   (öğrenilmedi!)
14/14 doğru -> temel-soru   (öğrenilmedi!)
15/15 doğru -> ogrenildi
14/20 doğru -> ogrenildi    (başarı %70, öğrenildi sayıldı)
```

Yani 14 soruyu tam doğru yapan öğrenci kapıyı açamıyor, ama 20 soruda 6 yanlış
yapan öğrenci açabiliyor. Öğrenci "Bitti" işaretlediği ve tümünü doğru yaptığı
halde AYT dersi açılmıyor. Bu, kullanıcıyı **yanlış yönlendirir**: neden
geçmediğini anlayamaz.

**Kanıt:** `edge-check.mjs` çıktısı (Bölüm 6'da tekrar üretilebilir).

**Öneri:** Eşiği başarıya bağla, soru sayısına değil. Örnek: `correct / total >= 0.7`
(yeterli soru çözülmüşse) **veya** `total >= 15 && correct/total >= 0.7`.
En azından alt sınırı düşür (ör. 8-10 soru), çünkü 15 zorunlu eşiği kısa
konularda ulaşılamaz olabilir. Karar kullanıcıya sorulmalı.

### B2 — Veri koruma fonksiyonunun testi yoktu (ORTA) — DÜZELTİLDİ

**Yer:** `app/src/lib/store.ts:40` (`mergeTopics`)

**Ne yanlış:** Uygulamanın en kritik fonksiyonu bu: kayıtlı veriyi yeni
müfredatla birleştirir. Hata yaparsa kullanıcı aylarca süren çalışma geçmişini
kaybeder. Ancak **hiçbir testi yoktu.** `grep -rn "mergeTopics" src/ scripts/`
komutu, `store.ts` dışında hiçbir eşleşme vermedi.

**Yapılan:** `app/src/lib/store.merge.test.ts` eklendi (5 test) ve `npm test`
içine kaydedildi. Testler şunları doğruluyor: kayıt yoksa müfredat üretiliyor,
kullanıcı alanları (durum, soru sayısı, not, tekrar tarihi) korunuyor, konu
adı müfredattan alınıyor, müfredatta olmayan kayıt sızmıyor.

**Testin dişli olduğu kanıtı:** `mergeTopics` içindeki `...old` yayılımını
kaldırıp bozdum; 5 testten **3'ü kırmızıya düştü**. Yani test gerçekten veri
kaybını yakalıyor. (Deney geçici kopyada yapıldı, sonra geri alındı.)

### B3 — Kullanılmayan import (DÜŞÜK) — DÜZELTİLDİ

**Yer:** `app/src/data/roadmap.ts:2` (`import { n } from "@/lib/calc";`)

`npm run lint` bir uyarı veriyordu: `'n' is defined but never used`. Kullanım
aranınca `n()` çağrısı bulunamadı (dosya `tytNets`/`aytNets` kullanıyor).
Import kaldırıldı; lint artık temiz.

---

## 4. GPT-6'nın sorduğu alanlara cevaplar

**Konu sırası ve müfredat:** 279 satır, 116 TYT + 69 AYT konusu. AYT Matematik
18 konu ve alt konuları kapsıyor (binom açılımı `Permütasyon – Kombinasyon`
altında mevcut). AYT Fizik 16, Kimya 14, Biyoloji 14, Geometri 7 konu. Yapı
tutarlı. **Ancak:** 2026-2027 YKS müfredatına harfiyen uygunluk iddiasını
kanıtlayamam; karşılaştırma resmî kaynak gerektirir. Bu bir "doğrulanamadı"
maddesidir, hata değildir.

**AYT kapıları:** Doğru çalışıyor. `roadmap.ts:119` `aytUnlocks`, TYT'deki ilgili
konuların `learningStage === "ogrenildi"` olmasını şart koşuyor. Konu anlatımı
tek başına yetmiyor, soru çözümü de gerekiyor — kullanıcının istediği davranış.
Kapı sayıları: mat 12, fiz 4, kim 5. (kimya metni 5'e düzeltildi.)

**Günlük/haftalık plan gerçekçiliği:** Varsayılan bütçe 240 dk/gün. Sabit
görevler (paragraf + problem) düşülünce günde ~2 yeni konu slotu kalıyor.
`planPace` hesapları TYT tur 1'i 02.02.2027, AYT'yi 08.04.2027'de bitiriyor —
kullanıcının hedeflerine uyuyor.

**Takvim çakışması:** 30 günü taradım, **sıfır çakışma**. Plan görevleri ile
yaşam blokları (yemek, spor, dinlenme) hiç örtüşmüyor.

**Net hesabı:** Doğru. `netOf` = doğru − yanlış/4 (`calc.ts:10`). TYT 4 bölüm,
AYT 4 ders toplanıyor. Boş alanlar `n()` ile 0 sayılıyor, bölüm hiç
doldurulmadıysa `null` dönüyor — doğru davranış.

**Veri kaybı ve tarih sınırları:** Yıl geçişi (31 Ara → 1 Oca), Şubat sonu,
artık yıl (2028-02-29) hepsi doğru hesaplanıyor. `mergeTopics` kullanıcı
verisini koruyor (B2'deki yeni testlerle doğrulandı).

**Çelişkili görevler:** Bulunmadı. 30 gün taramasında çakışma yok.

---

## 5. Geri çektiğim şüphe (dürüstlük notu)

Denetim sırasında `buildDailyPlan`'ı aynı girdiyle iki kez çağırınca çıktının
**farklı** olduğunu gördüm. Bunu önce ciddi bir hata sandım. İncelediğimde farkın
**yalnızca görev kimliği** (`id`) olduğunu buldum; plan içeriği (ders, konu,
saat, süre) birebir aynıydı.

```
id'ler dışında aynı mı: EVET
örnek id: mvwf64k6-7ygndh | mvwf64l8-shqytw
```

Sebep: `uid()` (`utils.ts:51`) zaman + rastgele sayı kullanıyor. **Ama bu zararsız,**
çünkü plan görevleri yalnızca ekranda gösteriliyor, kaydedilmiyor
(`program.tsx:31`, `smart-panels.tsx:17` — ikisi de `slots`'u sadece render
ediyor). Kalıcı kayıtlar `DailyRow` ve `CarryItem`, bunlar kendi kimliklerini
kullanıyor.

**Sonuç:** Hata değil. Raporlamıyorum. Ancak ileride biri plan görevini
kaydetmeye karar verirse bu kimlikler kararsız olur — o zaman düzeltilmeli.

---

## 6. Bulguların tekrar üretilmesi

B1'i doğrulamak için (projeye zarar vermez, sadece okur):

```bash
cd /workspace/project/app
cat > /tmp/check.mjs <<'EOF'
import { createServer } from "vite";
const s = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
const P = await s.ssrLoadModule("/src/lib/smart/progress.ts");
for (const [t,c] of [[10,10],[14,14],[15,15],[20,14]])
  console.log(`${c}/${t} -> ${P.learningStage({status:"Bitti",total:t,correct:c,wrong:0})}`);
await s.close();
EOF
cp /tmp/check.mjs ./check.mjs && node ./check.mjs; rm ./check.mjs
```

Beklenen çıktı: `10/10 -> temel-soru`, `14/14 -> temel-soru`,
`15/15 -> ogrenildi`, `14/20 -> ogrenildi`.

Son satırdaki `[20,14]` = 20 soruda 14 doğru (%70). Çıktı `c/t` biçiminde
yazıldığı için `14/20` görünür.

Not: `vite` proje içinden çalıştırılmalı, bu yüzden dosya geçici olarak kopyalanıyor.

---

## 7. Yapılan değişiklikler

| Dosya | Değişiklik | Sebep |
| --- | --- | --- |
| `src/lib/store.ts` | `mergeTopics`, `seedTopics` dışa açıldı | Test edilebilsin diye |
| `src/lib/store.merge.test.ts` | **Yeni dosya** (5 test) | Veri kaybı koruması denetlenmiyordu |
| `package.json` | `npm test`'e yeni test eklendi | Testin sürekli koşması için |
| `src/data/roadmap.ts` | Kullanılmayan `n` importu silindi | Lint uyarısı |

Bunların dışında hiçbir dosya değişmedi. Git geçmişi tam kayıt tutuyor.

---

## 8. Denetçi GPT-6'ya notlar

- Arşiv: `netdefter-kaynak.zip` (656 KB, **131 dosya** + 23 dizin = 154 zip
  girdisi, `node_modules`/`uploads`/ekran görüntüleri hariç). İçerik listesi:
  `ZIP-icerigi.txt`. **Not:** Arşiv artık doğrudan git commit'inden
  (`git archive`) üretilir; böylece içerik commit ile birebir aynıdır.
  Sayıyı bildirirken "zip girdisi" ile "dosya" karıştırılmamalı: 154 girdinin
  23'ü dizin girdisidir.
- **Eski kopya uyarısı:** `app/.vercel/output/static/` altında build artığı
  eski bir arşiv kopyası oluşabiliyordu ve yanlış (düzeltmelerden önceki)
  sürümü sunabiliyordu. İki konum da güncellendi; arşivi indirdikten sonra
  `roadmap.ts` içinde `subtopics` alanının bulunduğunu doğrulayın.
- Sır taraması yapıldı: `.env`, `.pem`, `.key` **yok**; anahtar/şifre
  bulunamadı. `package-lock.json` içindeki "token" eşleşmeleri npm paket adı
  (`js-tokens`), `migrations/auth` içindekiler ise tablo kolon adı.
- Senin üç önerini uyguladım: (1) testi geçici kopyada/geri alınabilir şekilde
  bozdum, (2) `npm run lint`'in `package.json`'da gerçekten tanımlı olduğunu
  doğruladım (`scripts.lint: "eslint ."`), (3) `npm ci` için `package-lock.json`
  mevcut ve güncel.
---

## 9. B1 ek incelemesi (GPT-6 talebi, 5 kontrol)

GPT-6 B1'i şimdilik düzeltmememi istedi; yalnızca inceleme yapıldı, **davranış
değiştirilmedi.**

### 9.1 `learningStage` fonksiyonunun tamamı

`app/src/lib/smart/progress.ts:29-44`:

```ts
export function learningStage(row: {
  status: string;
  total: number | null;
  correct: number | null;
}): LearningStage {
  if (row.status === "Tekrar Gerekli") return "tekrar-gerekli";
  const total = row.total ?? 0;
  const correct = row.correct ?? 0;
  if (row.status === "Bitti") {
    // "Bitti" tek başına öğrenildi demek değil: temel soru çözümü şart.
    if (total >= 15 && total > 0 && correct / total >= 0.7) return "ogrenildi";
    return total > 0 ? "temel-soru" : "anlatim";
  }
  if (row.status === "Çalışıyorum") return total > 0 ? "temel-soru" : "anlatim";
  return total > 0 ? "temel-soru" : "gorulmedi";
}
```

### 9.2 İki eşik ayrı ayrı

| Koşul | Değer | Kod |
| --- | --- | --- |
| Asgari soru sayısı | **15** | `total >= 15` |
| Başarı oranı | **%70** | `correct / total >= 0.7` |

İki koşul `&&` ile bağlı: **ikisi de** sağlanmalı.

### 9.3 İstenen beş örnek — gerçek fonksiyon çıktısı

```
14/14  oran %100.0  ->  temel-soru  (Temel soru çözümü yapıldı)
14/20  oran %70.0   ->  ogrenildi   (Öğrenildi, karma soruda uygulanabiliyor)
15/15  oran %100.0  ->  ogrenildi   (Öğrenildi, karma soruda uygulanabiliyor)
15/20  oran %75.0   ->  ogrenildi   (Öğrenildi, karma soruda uygulanabiliyor)
15/21  oran %71.4   ->  ogrenildi   (Öğrenildi, karma soruda uygulanabiliyor)
```

**Kritik gözlem:** `14/14` (tam başarı) öğrenilmedi sayılıyor, `14/20` (6 yanlış)
öğrenildi sayılıyor. Yani tek belirleyici **soru sayısı**, başarı değil.

### 9.4 `progress.test.ts` sınır durumları test ediyor mu? — HAYIR

**Düzeltme:** Bu bölümün ilk sürümünde "test dosyası `npm test` içinde koşmuyor"
diye bir iddia yazmıştım. **Bu iddia yanlıştı, geri çekiyorum.** İlk grep'imde
glob (`src/**/*.test.ts`) yanlış genişlediği için eşleşme boş göründü ve ben
bunu "test yok" sandım. Gerçekte `progress.test.ts` `package.json`'daki
`npm test` satırında kayıtlı ve koşuyor. Kanıt: `npm test` çıktısı
`▶ learningStage` başlığı ve alt testlerini gösteriyor. Ayrıca test sayısı
bunu doğruluyor: ikinci grup 78'den 83'e çıktı (5 merge testi ekledim),
yani `progress.test.ts`'in 10 testi zaten o 78'in içindeydi.

Dosya var, koşuyor ve `learningStage`'i test ediyor (satır 5-30). Ancak
**sınır değerleri test edilmiyor.** Kanıt: mutasyon deneyi.

| Deney | Sonuç |
| --- | --- |
| Eşiği `15` → `5` yaptım | 10 test **yine geçti** (fail 0) |
| Oranı `0.7` → `0.5` yaptım | 10 test **yine geçti** (fail 0) |

Test edilen tek "öğrenildi" örnekleri `total: 20, correct: 15` (satır 17) ve
`total: 30, correct: 30` (satır 18). İkisi de eşiklerin **güvenli içinde**;
sınıra dokunmuyor. Yani eşik değerleri bugün yanlışlıkla değiştirilse hiçbir
test kırmızıya düşmez. Testler geçiyor ama **eşiği sabitlemiyor.**

### 9.5 Arayüzde açıklama mesajı var mı? — HAYIR

- `STAGE_LABEL` (progress.ts:20) — "Temel soru çözümü yapıldı", "Öğrenildi…"
  gibi okunabilir etiketler tanımlı. **Ama hiçbir `.tsx` dosyasında
  kullanılmıyor.** `grep -rn "STAGE_LABEL" src/` yalnızca tanımın kendisini
  döndürüyor. Yani öğrenme aşaması kullanıcıya **hiç gösterilmiyor.**
- Kapı göstergesi (`program.tsx:119-122`, `Gate` bileşeni) yalnızca
  "Açık/Kapalı" ve "5/12 TYT kimya kapısı" yazıyor. **Hangi konunun neden
  sayılmadığını söylemiyor.**
- "yeterli soru" / "soru verisi yok" aramaları yalnızca alakasız yerlerde
  eşleşti (`program.tsx:284` haftalık zayıf alan; `engine.ts:249` başarı yüzdesi).

**Sonuç:** 14/14 yapan öğrenci kapıda "Kapalı" görür, nedeni açıklanmaz.
Öğrenci "Bitti" işaretlediğini ve tümünü doğru yaptığını bilir; neden hâlâ
kapalı olduğunu **anlayamaz.**

### 9.6 Özet: ne doğrulandı, ne değil

**Doğrulandı:** `progress.test.ts` mevcut, `npm test` içinde koşuyor, 10 test
geçiyor, `learningStage`'i test ediyor. Yani davranış "denetleniyor" görünüyor.

**Doğrulanmadı:** Sınır değerler sabit değil. Eşiği 15→5 ve 0.7→0.5 yaptığımda
testler yine geçti. Testler yalnızca eşiklerin güvenli içindeki örnekleri
kontrol ediyor, sınırı değil.

### 9.7 Değerlendirme

GPT-6'nın tespiti doğru: iki ayrı koşul var (asgari 15 soru + %70 başarı),
ikisi de meşru olabilir. Ancak iki somut eksik buldum:

1. **B1:** Eşik başarıya değil soru sayısına bakıyor → 14/14 geçmiyor, 14/20
   geçiyor. Kullanıcıya açıklanamaz.
2. **Arayüz boşluğu:** Aşama etiketleri (`STAGE_LABEL`) hazır ama hiçbir
   arayüzde gösterilmiyor; kapı nedeninin açıklaması yok.
3. **Test sınırı zayıf:** `progress.test.ts` koşuyor ama eşik değerlerini
   sabitlemiyor (mutasyonla kanıtlandı).

**"15" sayısının gerekçesi kodda yok.** Tek yorum satırı "temel soru çözümü
şart" diyor, ama neden 15 (neden 10 veya 20 değil) belirtilmemiş. Bu yüzden
15'i kesin bir pedagojik standart olarak sunmuyorum — sadece mevcut kod
davranışı olarak raporluyorum.

**Öneriler (uygulanmadı, karar bekliyor):**

1. **Sınır testleri ekle (risksiz):** 14/14, 14/20, 15/15, 15/20, 15/21
   örneklerini teste bağla; eşik yanlışlıkla değişirse test kırmızıya düşsün.
   Bu bir davranış değişikliği değil, sadece mevcut davranışı sabitler.
2. **Arayüz:** `STAGE_LABEL`'i konular tablosunda göster. GPT-6'nın önerdiği
   ayrı durum ("başarı yeterli, ancak yeterli soru verisi yok") için
   `learningStage`'e yeni bir değer (`"veri-yetersiz"`) eklemek gerekir —
   bu davranış değişikliğidir, onay bekliyor.
3. **15 gerekçesi:** Kodda açıklama ekle veya değeri gözden geçir. Kesin
   pedagojik kural gibi sunmuyorum.

---

## 10. GPT-6 onayı sonrası uygulanan değişiklikler (Bölüm 10)

GPT-6 iki kararı onayladı. **Öğrenme eşiği ve planlama davranışı
DEĞİŞTİRİLMEDİ**; hiçbir kayıt/veri dönüştürülmedi.

### 10.1 Sınır testleri (onaylandı, uygulandı)

`app/src/lib/smart/progress.test.ts` içine 5 sınır testi eklendi:

| Girdi | Beklenen |
| --- | --- |
| 14/14 | `temel-soru` (başarı %100 ama soru yetersiz) |
| 14/20 | `ogrenildi` (iki eşik de karşılanır) |
| 15/15 | `ogrenildi` (sınırda soru sayısı) |
| 13/20 | `temel-soru` (başarı %65 < %70) |
| 10/7, 20/14, 15/10 | eşiklerin kapsayıcılığı |

**Mutasyon kanıtı — iki eşik de artık korunuyor:**

| Mutasyon | Sonuç |
| --- | --- |
| Eşik `15` → `5` | 15 testten **2 kırmızı** (14/14 ve kapsayıcılık testi) |
| Oran `0.7` → `0.5` | **2 kırmızı** (13/20 ve kapsayıcılık testi) |
| Oran `0.7` → `0.9` | **3 kırmızı** (14/20 ve kapsayıcılık testi) |

Önceki raporda (Bölüm 9.4) eşiği 15→5 yaptığımda testler **yine geçiyordu**;
şimdi düşüyor. Eksik kapatıldı.

### 10.2 Öğrenme aşamalarının arayüzde gösterimi (onaylandı, uygulandı)

GPT-6'nın şartı: `learningStage` hesaplamasını değiştirme, yeni enum değeri
ekleme, önce `LearningStage` kullanımının tamamını incele. Bunu yaptım.

**`LearningStage` kullanım taraması (sonuç):**

| Yer | Kullanım | Etki |
| --- | --- | --- |
| `progress.ts:47` `STAGE_CREDIT` | Aşama → ilerleme kredisi | `Record<LearningStage, number>` — yeni değer eklenirse **derleme hatası** verir (iyi) |
| `progress.ts:62` `WeightInput.stage` | `weightedProgress` girdisi | yeni değer sessizce eklenirse kredisi tanımsız kalır |
| `roadmap.ts` `topicDone`/`mastered` | `=== "ogrenildi"` karşılaştırması | kapı mantığı |
| `mock-plan.ts:75` | `=== "ogrenildi"` | deneme hazırlığı |
| `engine.ts` | **doğrudan kullanmıyor** | etkisi `roadmap.ts` üzerinden dolaylı |

**Karar:** Yeni enum değeri **eklenmedi.** Bunun yerine `learningStage`'den
bağımsız, hesaplama yapmayan bir açıklama fonksiyonu yazıldı:
`explainStage` (`progress.ts:86`). `weightedProgress`, `stageCredit`,
planlama davranışı **hiç değişmedi.**

**Eşikler tek kaynağa taşındı** (`progress.ts:57-58`):

```ts
export const MIN_QUESTIONS_FOR_MASTERED = 15;
export const MASTERY_RATIO = 0.7;
```

Hem `learningStage` hem `explainStage` bu sabitleri kullanır, böylece arayüz
açıklaması ile hesaplanan aşama **asla çelişemez.** Değerler mevcut
davranıştan alındı; değiştirilmedi.

`explainStage` dört soruyu ayrı ayrı yanıtlar:

| Alan | Anlam |
| --- | --- |
| `completed` | Konu tamamlanmış mı |
| `enoughQuestions` | Asgari soru sayısı karşılanmış mı |
| `enoughSuccess` | Başarı oranı hedefi karşılanmış mı |
| `mastered` | `learningStage` ile birebir aynı sonuç |
| `summary` | Kullanıcıya gösterilecek tek cümle |
| `missing` | Eksik koşulların listesi |

**Kapı göstergesi** (`roadmap.ts:140` `gateBlockers`): Artık yalnızca `5/12`
değil, kapıyı kapatan konuların **adları ve eksik koşulları** döndürülüyor.
Mevcut `topicDone` koşulunu kullanır; `aytUnlocks` hesabına dokunmaz.

### 10.3 Arayüz davranışı (canlı doğrulandı)

`/konular` tablosuna **Aşama** sütunu eklendi. Gerçek modüllerle üretilen
hücre metinleri:

```
14/14 Bitti  | "Temel soru çözümü yapıldı (soru verisi yetersiz)"
             | title: Başarı oranı yeterli (%100), ancak öğrenildi sayılmak
             |        için yeterli soru verisi yok (14/15).
15/15 Bitti  | "Öğrenildi, karma soruda uygulanabiliyor"
             | title: Öğrenildi sayıldı: 15/15 doğru (%100), asgari 15 soru karşılandı.
13/20 Bitti  | "Temel soru çözümü yapıldı"
             | title: Soru sayısı yeterli (20), ancak başarı oranı hedefin altında (%65 < %70).
14/20 Bitti  | "Öğrenildi, karma soruda uygulanabiliyor"
             | title: Öğrenildi sayıldı: 14/20 doğru (%70), asgari 15 soru karşılandı.
```

**GPT-6'nın 14/14 örneği tam istendiği gibi karşılandı:** başarı oranının
yeterli olduğu, ama 15 soruluk alt sınır nedeniyle henüz öğrenildi
sayılmadığı açıkça yazılıyor.

`/program` sayfasındaki kapı göstergeleri (canlı, tarayıcıyla tıklandı):

```
AYT Mat / Geo   Kapalı   0/12 TYT sayı çekirdeği   [Kapatan 12 konu ▼]
AYT Fizik       Kapalı   0/4  TYT fizik kapısı     [Kapatan 4 konu ▼]
AYT Kimya       Kapalı   0/5  TYT kimya kapısı     [Kapatan 5 konu ▼]
```

Butona basınca kapatan konular adları ve gerekçeleriyle açılıyor:

```
- Temel Kavramlar
  Görülmedi
  Henüz başlanmadı.
- Sayı Basamakları
  Görülmedi
  Henüz başlanmadı.
...
```

Kapı sayıları (12/4/5) `aytUnlocks` ile birebir tutarlı.

### 10.4 Tutarlılık testi (yeni dosya)

`app/src/lib/smart/explain.test.ts` — 10 test:

1. **Tutarlılık:** 4 durum × 11 soru sayısı × 5 doğru değeri = **100'den fazla
   kombinasyonda** `explainStage(...).mastered === (learningStage(...) === "ogrenildi")`.
2. Eşiklerin beklenen değerler olduğu.
3. 14/14 → "yeterli soru verisi yok" mesajı.
4. 15/15 → "Öğrenildi sayıldı" mesajı, `missing` boş.
5. 13/20 → "başarı oranı hedefin altında" mesajı.
6. Soru verisiz "Bitti" → `anlatim`.
7. `gateBlockers`: kapı açıkken boş liste.
8. `gateBlockers`: eksik konuları ad + gerekçeyle listeler.
9. `gateBlockers` uzunluğu `aytUnlocks` eksik sayısıyla **tutarlı**.
10. Müfredatta olmayan kapı konusu bildirilir.

### 10.5 Doğrulama komutları ve gerçek çıktılar

| Komut | Sonuç |
| --- | --- |
| `npm test` | **149 + 98 geçti, 0 hata** |
| `npm run test:plan` | **11 geçti** |
| `npx tsc --noEmit` | temiz (EXIT=0) |
| `npm run lint` | temiz (EXIT=0) |
| `npm run build` | EXIT=0 |

İkinci test grubu 83'ten **98'e** çıktı: +5 sınır testi (Bölüm 10.1) ve
+10 tutarlılık testi (Bölüm 10.4). Ham çıktılar `KANIT-loglari.txt`.

### 10.6 Değişen dosyalar

| Dosya | Değişiklik |
| --- | --- |
| `src/lib/smart/progress.ts` | Eşikler sabite taşındı; `explainStage` eklendi. **`learningStage` mantığı aynı.** |
| `src/lib/smart/progress.test.ts` | +5 sınır testi |
| `src/lib/smart/explain.test.ts` | **Yeni dosya** (10 test) |
| `src/data/roadmap.ts` | `gateBlockers`, `GATE_DEFS` eklendi. `aytUnlocks` aynı. |
| `src/routes/konular.tsx` | Aşama sütunu |
| `src/routes/program.tsx` | Kapı engelleri listesi |
| `package.json` | `explain.test.ts` test betiğine eklendi |

**Değişmeyen (GPT-6 şartı):** öğrenme eşikleri, deneme eşikleri,
`weightedProgress`, planlama davranışı, kullanıcı kayıtları/verisi.

### 10.7 Hâlâ açık olan tek soru

B1'in **kendisi** (eşiğin soru sayısına bakması) değiştirilmedi — GPT-6
davranış değişikliği istemedi. Artık öğrenci 14/14'te neden geçmediğini
görüyor, ama 14/14 hâlâ geçmiyor. Eşiğin kendisinin değişip değişmeyeceği
ayrı bir karar.

---

## 11. İkinci inceleme turu: iki düzeltme (Bölüm 11)

GPT-6 ikinci turda üç bulgu bildirdi, sonra birinciyi **kapsam dışı**
bıraktı. Uygulanan iki düzeltme aşağıda. Eşikler (15 soru, %70), planlama
motoru ve kullanıcı verileri **değiştirilmedi.**

### 11.0 Üç bulgunun bağımsız doğrulaması

Bulguları körü körüne kabul etmedim; her birini gerçek fonksiyonlarla
çalıştırıp doğruladım.

| Bulgu | Doğrulandı mı | Kanıt |
| --- | --- | --- |
| 1. Eski müfredat kayıtları korunmuyor | **Evet, ama GPT-6 kapsam dışı bıraktı** | `mergeTopics` yalnızca `seedTopics()` sonucunu döndürüyor. Ek olarak mevcut test bunu *kasıtlı* davranış olarak sabitliyor: "müfredatta olmayan kaydı sessizce düşürür". |
| 2. `gateBlockers` yalnızca ilk alt konuyu gösteriyor | **Evet** | 2 eksik alt konu → `engel sayisi: 1`, yalnızca ilki görünüyor |
| 3. `explainStage` "Tekrar Gerekli" için yanlış gerekçe | **Evet** | 30/28'de `missing: ["konu tamamlandı olarak işaretlenmedi"]` — yanlış |

**Bulgu 1 hakkında not:** GPT-6 "ayrı saklama sistemi kurma" dedi, ben de
kurma**dım**. Ancak doğrulama şunu gösteriyor: `mergeTopics` kaydı
korumuyor, *siliyor*. Mevcut test de bunu onaylıyor. Bu bir tasarım tercihi
olabilir — ama "korunmuyor olabilir" değil, kesin olarak "korunmuyor".
Karar GPT-6'nın; ben kapsam dışı bırakılan bu noktayı kayda geçiriyorum.

### 11.1 Bulgu 2 düzeltmesi — tüm eksik alt konular

**Kök neden:** `roadmap.ts` içinde `notDone[0]` yalnızca ilk eksik alt
konuyu alıyordu.

**Çözüm:** Konu başına yine **tek** engel kaydı dönüyor
(`blockers.length` = eksik konu sayısı, `aytUnlocks` ile tutarlı kalıyor),
ama kaydın içine `subtopics` dizisi eklendi ve eksik alt konuların
**hepsi** her biri kendi aşaması ve gerekçesiyle listeleniyor.

```ts
export interface GateBlocker {
  topic: string;
  stage: LearningStage;      // ilk eksik alt konu (geriye dönük uyum)
  stageLabel: string;
  reason: string;
  correct: number;
  total: number;
  subtopics: GateBlockerSubtopic[];  // YENİ: tüm eksik alt konular
}
```

Eski alanlar korundu; `subtopics[0]`'dan türetiliyor. Böylece dışa dönük
sözleşme bozulmadı.

**Gerçek çıktı** (3 alt konu, 1'i öğrenildi):

```
engel kaydi: 1 | alt konu sayisi: 2
  - Sayi kumeleri [Görülmedi]
  - Islem ozellikleri [Görülmedi]
```

Arayüzdeki `Gate` bileşeni de güncellendi: başlık artık
`Kapatan 12 konu / 14 alt konu` gösteriyor, liste açıldığında birden fazla
alt konu varsa hepsi iç içe listeleniyor.

### 11.2 Bulgu 3 düzeltmesi — "Tekrar Gerekli" açıklaması

**Kök neden:** `completed = row.status === "Bitti"` olduğu için "Tekrar
Gerekli" konularda `completed === false` oluyor ve `missing` listesine
yanlışlıkla "konu tamamlandı olarak işaretlenmedi" ekleniyordu.

**Çözüm:** `missing` üretimi `needsReview` durumuna göre ayrıldı:

```ts
const needsReview = row.status === "Tekrar Gerekli";
if (needsReview) missing.push("tekrar gerekli olarak işaretlendi");
else if (!completed) missing.push("konu tamamlandı olarak işaretlenmedi");
```

`completed` ve `mastered` **değiştirilmedi** — "Tekrar Gerekli" hâlâ
öğrenildi sayılmıyor. Yalnızca gerekçe metni doğru yazılıyor.

**Gerçek çıktı:**

```
30/28: Tekrar gerekiyor; öğrenildi sayılmaz.
  missing: ["tekrar gerekli olarak işaretlendi"]
5/2:   Tekrar gerekiyor; öğrenildi sayılmaz.
  missing: ["tekrar gerekli olarak işaretlendi",
            "yeterli soru verisi yok (5/15)",
            "başarı oranı düşük (%40 < %70)"]
```

Öncesinde ilk satır yanlışlıkla "konu tamamlandı olarak işaretlenmedi"
diyordu.

### 11.3 Yeni sınır testleri (+10)

`explain.test.ts` içine iki yeni blok eklendi.

**"Tekrar Gerekli" açıklaması (6 test):**

1. 30/28 → "tamamlan" içermez, "tekrar" içerir
2. 30/30 → iki sayısal eşik karşılanır, yine de öğrenildi sayılmaz
3. 5/2 → üç gerekçe de doğru, "tamamlan" yok
4. `null/null` → "tamamlanmadı" demez
5. **Regresyon:** "Başlamadım" hâlâ "tamamlanmadı" der
6. **Regresyon:** "Çalışıyorum" hâlâ "tamamlanmadı" der

**Çoklu eksik alt konu (4 test):**

1. Müfredattan çoklu alt konulu bir konu seçilir; **hiçbir alt konu
   atlanmaz** (isim listeleri birebir karşılaştırılır)
2. Bir alt konu öğrenildi, diğeri eksikse **yalnızca eksik olan** listelenir
3. Konu başına **tam 1** engel kaydı (alt konu sayısından bağımsız)
4. `subtopics[0]` ile geriye dönük alanlar tutarlı

Testler sabit bir konu adı varsaymıyor; hedef konuyu **müfredattan
seçiyor**, böylece müfredat değişse de test kırılmaz.

### 11.4 Mutasyon kanıtı — testler gerçekten yakalıyor

Testlerin dişli olduğunu kanıtlamak için iki düzeltmeyi geçici olarak eski
hâline döndürdüm:

| Mutasyon | Sonuç |
| --- | --- |
| Bulgu 3: `needsReview` mantığı kaldırıldı | **3 test kırmızı** |
| Bulgu 2: `notDone.slice(0,1)` (eski hâl) | **2 test kırmızı** |
| İkisi birden | **20 testten 5 kırmızı** |
| Düzeltmeler geri alındı | **20/20 yeşil** |

Kırmızıya düşen testler tam olarak ilgili bulguların testleri. Ham çıktı
`KANIT-loglari.txt` içindeki mutasyon bölümünde.

### 11.5 Doğrulama komutları ve gerçek çıktılar

| Komut | Sonuç |
| --- | --- |
| `npm test` | **149 + 108 geçti, 0 hata** |
| `npm run test:plan` | **11 geçti** |
| `npx tsc --noEmit` | temiz (EXIT=0) |
| `npm run lint` | temiz (EXIT=0) |
| `npm run build` | EXIT=0 |

İkinci test grubu 98'den **108'e** çıktı (+10 yeni test). Ham çıktılar
`KANIT-loglari.txt`.

### 11.6 Değişen dosyalar

| Dosya | Değişiklik |
| --- | --- |
| `src/data/roadmap.ts` | `GateBlocker.subtopics` + `GateBlockerSubtopic`; tüm eksik alt konular listeleniyor |
| `src/lib/smart/progress.ts` | `missing` üretiminde "Tekrar Gerekli" ayrımı |
| `src/lib/smart/explain.test.ts` | +10 test (6 tekrar + 4 çoklu alt konu) |
| `src/routes/program.tsx` | `Gate` bileşeni alt konuları iç içe gösteriyor |

**Değişmeyen:** 15 soru ve %70 eşikleri, `learningStage`, `mastered`,
`weightedProgress`, planlama motoru, `mergeTopics`, kullanıcı verileri.

### 11.7 Kapsam dışı bırakılan bulgu

Bulgu 1 (eski müfredat kayıtları) GPT-6'nın kararıyla uygulanmadı.
`mergeTopics` **hiç değiştirilmedi.** Bu bilinçli bir kapsam kararı; kayda
geçirildi.

### 11.8 Arşiv sürüm karışıklığı (düzeltildi)

GPT-6 arşivde iki düzeltmeyi de bulamadığını bildirdi. Araştırma sonucu
**kod doğruydu, arşiv yanlıştı.**

**Kök neden:** `app/.vercel/output/static/` altında, `vite build` sırasında
oluşan **eski bir arşiv kopyası** kalmıştı. Zaman damgaları:

| Konum | Saat | Bayt | Girdi | İçerik |
| --- | --- | --- | --- | --- |
| `app/.vercel/output/static/` | 18:32 | 630236 | 153 | **eski** (`notDone[0]`) |
| `app/public/` | 18:35 | 656187 | 154 | doğru (`subtopics`) |

GPT-6 eski kopyayı indirmiş. Doğrulama: 8080'den servis edilen arşiv
zaten doğruydu (`subtopics` mevcut); yalnızca `.vercel` kopyası bayattı.

**Sayı farkı:** "153 vs 154" farkının sebebi de bu eski kopyaydı. Ayrıca
raporda "154 dosya" yazmam yanlıştı: 154 **zip girdisi** vardır, bunun
131'i dosya, 23'ü dizin girdisidir. Düzeltildi.

**Kalıcı çözüm:** Arşiv artık çalışma dizininden değil, doğrudan
`git archive` ile **commit'ten** üretiliyor. Böylece arşiv içeriği commit ile
birebir aynıdır ve eski kopya sızamaz. (Bu elle üretim 11.9'da tekrarlanabilir
bir komuta bağlandı; 11.8'deki hâliyle her commit'te yeniden çalıştırılmadığı
için arşiv `764b794`'te kalmış, HEAD `c611236` iken bayatlamıştı.)

**Arşivden doğrulanan içerik:**

| Dosya | Kontrol | Sonuç |
| --- | --- | --- |
| `roadmap.ts` | `notDone[0]` | **yok** |
| `roadmap.ts` | `subtopics` | **var** |
| `progress.ts` | `needsReview` | **var** |
| `progress.ts` | "tekrar gerekli olarak işaretlendi" | **var** |
| `explain.test.ts` | `it()` sayısı | **20** |
| `explain.test.ts` | "Tekrar Gerekli" bloğu | **var** |
| `explain.test.ts` | "çoklu eksik alt konu" bloğu | **var** |


### 11.9 Arşiv üretiminin kalıcı otomasyonu

11.8'deki "kalıcı çözüm" elle çalıştırılan bir `git archive` idi; tekrarlanabilir
bir komut olmadığı için `c611236`'da arşiv yeniden üretilmedi ve `764b794`'te
kaldı. Denetim bunu gösterdi: arşivde `Kimya` satırı 9, HEAD'de 20; `curriculum`
kaydı 279'a karşı 283; test adı "185 konuyu"ya karşı "186 konuyu".

**Eklenen:** `npm run archive` (`app/scripts/build-archive.mjs`) ve
`npm run archive:check`.

- Üretim tek bir `git archive` çağrısından ZIP + `ZIP-icerigi.txt` +
  `ARSIV-BILGISI.txt` üretir; üçü aynı kaynak sürümü tanımlar.
- `ARSIV-BILGISI.txt` kaynak commit'i, tarihini, girdi sayısını ve SHA-256'yı
  kaydeder. Metadata, kaynak ZIP'in **içine girmez** (dışlama listesinde).
- Yazımlar atomik (temp dosya + rename); başarısız üretim mevcut dosyaları
  bozmaz ve yarım arşiv bırakmaz.
- `.vercel/output/static/` yalnızca zaten varsa senkronlanır; yoksa
  oluşturulmaz.
- `archive:check`, her zaman HEAD'i değil, `ARSIV-BILGISI.txt` içindeki kaynak
  commit'i yeniden üretip içerik karşılaştırır. Böylece arşiv ayrı commit ile
  kaydedildikten sonra da geçer; metadata commit'i yoksa veya ZIP farklıysa
  hata koduyla sonlanır.
- `build-archive.test.mjs` ile 20 test eklendi (dışlama, atomik yazım, metadata
  turu, ayrı-commit sonrası `check`, sapma senaryoları).
