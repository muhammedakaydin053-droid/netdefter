# NetDefter — Bağımsız İnceleme Dosyası (AI denetimi için)

Bu dosya, siteyi **başka bir yapay zekâya denetletmek** için hazırlandı.
Aşağıdaki metni olduğu gibi kopyalayıp denetçi modele verebilirsin. Dosyanın
sonunda denetçiye verilecek **hazır istem (prompt)** var.

---

## 1. Proje nedir

NetDefter, YKS'ye (TYT + AYT Sayısal) hazırlanan **tek bir kullanıcı** için
yazılmış çalışma takip uygulaması. Tarayıcıda çalışır, veriyi cihazda saklar.

Kullanıcı profili:

- Çalışmaya **1 Kasım 2026**'da başlıyor.
- TYT sınavı **19 Haziran 2027**, AYT **20 Haziran 2027**.
- Kullanıcının kendi tur hedefleri: TYT ilk tur **31.01.2027**, AYT ilk tur
  **15.04.2027**, eksik kapatma **10.05.2027**.

Uygulamanın amacı: hangi konuyu ne zaman çalışacağını, ne zaman deneme
çözeceğini ve neyi tekrar edeceğini kullanıcı adına planlamak.

## 2. Nerede duruyor

```
/workspace/project
├── INCELEME.md          ← bu dosya
├── AGENTS.md            ← depo notları
├── app/                 ← uygulamanın tamamı
│   ├── package.json
│   ├── src/
│   │   ├── routes/      ← 10 sayfa (program, konular, denemeler, ...)
│   │   ├── data/        ← müfredat, takvim, kapılar, kaynaklar
│   │   └── lib/
│   │       ├── smart/   ← planlama motoru (asıl zekâ burada)
│   │       └── store.ts ← veri saklama
│   └── scripts/
└── proxy.py
```

Çalışma dizini: `/workspace/project/app`.

## 3. Nasıl çalıştırılır

```bash
cd /workspace/project/app

npm install          # bağımlılıklar
npm test             # veri + akıllı modül testleri
npm run test:plan    # program motoru regresyon testleri
npx tsc --noEmit     # tip kontrolü
npm run build        # üretim derlemesi
npm run dev          # geliştirme sunucusu (port 8080)
```

Not: `npm test` ve `npm run test:plan` **geçiyor olmalı**. Geçmiyorsa bu
başlı başına bir bulgudur.

Beklenen sonuç (bu dosyanın yazıldığı andaki durum):

| Komut | Beklenen |
| --- | --- |
| `npm test` | 149 + 78 test, hepsi geçer |
| `npm run test:plan` | 11 test, hepsi geçer |
| `npx tsc --noEmit` | çıktı yok (temiz) |
| `npm run build` | hatasız tamamlanır |

Sayılar tutmuyorsa ya test eklenmiş ya da bir test düşmüş demektir; denetçi
hangisi olduğunu araştırsın.

## 4. Denetlenecek asıl sorular

Bunlar kullanıcının gerçek endişeleri. Denetçinin bunlara cevap vermesi
bekleniyor:

**A. Sağlamlık**

1. Uygulama kullanıcı verisini kaybediyor mu? (Konu kayıtları, yanlışlar,
   denemeler, günlük çalışma.) `src/lib/store.ts` içindeki `mergeTopics` ve
   `persist` yapılandırmasına bak. Bir sürüm güncellemesi eski veriyi siler mi?
2. Tarih hesapları doğru mu? Sınır durumlar: ay sonu, yıl geçişi, yaz saati,
   pazar günü, sınav gününün kendisi.
3. Aynı gün için plan iki kez üretilirse çakışma olur mu?
4. Kullanıcı hiç veri girmezse (boş durum) uygulama çöker mi?
5. `npm run lint` ve `npx tsc --noEmit` temiz mi?

**B. İçerik hazırlığı**

6. `src/data/curriculum.json` içindeki TYT ve AYT Sayısal konu listesi
   **eksiksiz mi**? 2026-2027 YKS müfredatına göre eksik veya fazla konu var mı?
   (Bu maddeyi kendi bilginle karşılaştır; dosya satır satır okunmalı.)

   Mevcut durum (doğrulanmış sayılar):

   | Kapsam | Konu sayısı |
   | --- | --- |
   | Toplam satır (konu × alt konu) | 279 |
   | TYT konu | 116 |
   | AYT konu | 69 |

   Dersler: TYT'de Türkçe, Matematik, Geometri, Fizik, Kimya, Biyoloji, Tarih,
   Coğrafya, Felsefe, Din Kültürü. AYT'de Matematik, Geometri, Fizik, Kimya,
   Biyoloji. Denetçi, bu derslerin altındaki konu listesini 2026-2027 YKS
   müfredatıyla karşılaştırıp eksik konu arasın.
7. Konu adları tutarlı mı? ("EBOB – EKOK" gibi tire/boşluk farkları kapıları
   sessizce bozar.)

**C. Doğruluk**

8. `src/data/targets.ts` içindeki **tarihler ve sınav bilgileri** doğru mu?
   Özellikle 2027-YKS sınav günleri. Kaynakların gerçekten söylediği şey,
   `SOURCES[].finding` alanında yazılı — bu alıntılar uydurma mı, gerçek mi?
9. `SOURCES[].strength` alanı dürüst mü? "resmi" etiketi yalnızca gerçekten
   resmî kaynaklarda mı kullanılmış?
10. `PLANNING_BANDS_NOTE` uyarısı yerinde mi? Program, kaynaklarda olmayan bir
    eşiği (ör. "%40 kapsam") kanıtlanmış kural gibi sunuyor mu?

**D. Hata tespiti**

11. `src/lib/smart/engine.ts` içindeki **puanlama formülü** mantıklı mı?
    Katsayılar (`weakness * 0.28`, `freq * 0.24`, `criticalFix` vb.) keyfî mi,
    yoksa savunulabilir mi? Bir konu haksız yere öne/geriye atılıyor mu?
12. Sert kapılar (`MAT_AYT_GATE`, `FIZ_AYT_GATE`, `KIM_AYT_GATE`,
    `BIO_SKIP_FOR_FAST`) kullanıcının istediği sırayı gerçekten uyguluyor mu?
    AYT dersi, kapı bitmeden açılabiliyor mu?
13. Paragraf ve Problemler gibi **sürekli pratik** konuları sıra kontrolünü
    kilitleyebiliyor mu? (Bu hata daha önce bulunup düzeltildi; tekrar var mı?)
14. Testler gerçekten bir şey denetliyor mu, yoksa hep geçen boş testler mi?
    Testleri **elle bozup** kırmızıya düştüklerini doğrula.

## 5. Bilinen ve kabul edilen sınırlar

Denetçi bunları "hata" diye raporlamasın; bunlar bilinçli tercih:

- Deneme sıklığı eşikleri (%35, %50, %70, %85) hiçbir kaynakta "kesin kural"
  olarak geçmiyor. Kaynaklar açıkça "tek bir yüzdesi yoktur" diyor. Bu yüzden
  `PLANNING_BANDS_NOTE` uyarısı ekranda görünür durumda.
- Branş denemesi MEB/ÖSYM kılavuzlarında tanımlı resmî bir sınav türü değil.
- Uygulama tek kullanıcı için; çok kullanıcılı yetkilendirme kapsam dışı.
- Notion "TKS" listeleri, YouTube ders programı ve Instagram içeriğinin
  **kendisi** bu depoda yok; yalnızca bunlardan çıkarılan sonuçlar var.

## 6. Rapor biçimi (denetçiden istenen)

Her bulgu için şu dört şeyi yaz:

```
Bulgu:      ne yanlış
Yer:        dosya:satır
Kanıt:      kodu çalıştırınca görülen sonuç (komut + çıktı)
Önem:       kritik / orta / düşük
Öneri:      nasıl düzeltilir
```

Kurallar:

- **Kanıtsız iddia yazma.** "Muhtemelen hatalıdır" yerine kodu çalıştır, çıktıyı
  göster.
- Dosyayı **değiştirme**. Yalnızca incele ve raporla.
- Emin olmadığın noktayı "emin değilim" diye işaretle. Uydurma.
- En fazla **10 bulgu**; en önemliden başla.

---

## 7. Denetçiye verilecek hazır istem

Aşağıdaki metni kopyala, denetçi yapay zekâya ver:

> Sen kıdemli bir yazılım denetçisisin. `/workspace/project` altındaki NetDefter
> adlı YKS çalışma takip uygulamasını denetleyeceksin.
>
> Önce `/workspace/project/INCELEME.md` dosyasını oku; proje bağlamı, çalıştırma
> komutları, denetlenecek sorular ve rapor biçimi orada yazılı.
>
> Görevin: uygulamayı çalıştır, testleri koş, kodu oku ve **gerçek hataları**
> bul. Özellikle şu dört alana bak: veri kaybı riski, içerik eksikliği
> (`curriculum.json` müfredatı), tarih/kaynak doğruluğu ve planlama motorunun
> puanlama mantığı.
>
> Kurallar:
> - Her bulguyu çalıştırdığın komut ve aldığın çıktıyla kanıtla.
> - Dosyaları değiştirme; yalnızca incele.
> - Testleri elle bozup gerçekten hata yakaladıklarını doğrula.
> - "Bilinen ve kabul edilen sınırlar" bölümündekileri hata olarak yazma.
> - Emin olmadığın noktayı açıkça belirt; uydurma.
> - En fazla 10 bulgu, en önemliden başlayarak, Bölüm 6'daki biçimde.
