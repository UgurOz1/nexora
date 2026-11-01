# Öğrenme Günlüğü

Her oturumun sonunda kısa bir giriş eklenir. Amaç: öğrendiğini kendi cümlelerinle yazmak. Kendi cümlelerinle anlatamıyorsan henüz öğrenmemişsindir.
Bu dosya mülakat hazırlığında da ana kaynağın olacak.

## Şablon

```
### YYYY-AA-GG · Hafta N · Konu
**Ne yaptık:** ...
**Öğrendiğim kavramlar:** (her biri için 1-2 cümle, kendi cümlelerimle)
**Neden böyle yaptık:** ...
**Takıldığım / yanlış anladığım şey:** ...
**Sonraki adım:** ...
```

---

### 2026-10-31 · Hazırlık · Planlama

**Ne yaptık:** Proje planını, çalışma kurallarını (CLAUDE.md) ve karar kayıt sistemini (ADR) oluşturduk.
**Öğrendiğim kavramlar:**

- _CLAUDE.md:_ Claude'un her oturumda okuduğu proje talimatları dosyası. Projenin bağlamı ve kurallar burada durur, böylece her oturumda baştan anlatmam gerekmez.
- _ADR (Architecture Decision Record):_ Önemli bir teknik kararı, alternatifleri ve gerekçesiyle kaydeden kısa doküman. Şirketlerde "bunu neden böyle yaptık?" sorusunun cevabıdır.
- _Definition of Done:_ Bir işin "bitti" sayılması için gereken ortak kriterler listesi.

**Sonraki adım:** Hafta 1, Docker'ı kurmak ve öğrenmek.

### 2026-10-31 · Hafta 1 · Docker ve proje altyapısı

**Ne yaptık:** Docker Desktop, docker-compose ile Postgres + Redis + Mailpit, pnpm monorepo, Prettier + Husky + commitlint, GitHub Actions CI, korumalı `main`.
**Kavramlar:**

- _Image / container:_ Image değişmeyen şablon, container onun çalışan hali.
- _Volume:_ Container silinince kaybolmaması gereken verinin (veritabanı dosyaları) tutulduğu yer.
- _Docker client / daemon:_ `docker` komutu sadece istemci; asıl işi arka plandaki daemon yapar. "daemon is not running" hatası bu yüzden çıkar.
- _CI:_ Her PR'da kodu temiz bir makinede kontrol eder; "bende çalışıyor" yetmez.
- _Branch koruması:_ `main`'e doğrudan push yok, PR + yeşil CI zorunlu.

**Ders:** Bağımlı olduğun araç değişebilir (MinIO image'ı yayınlanmaz oldu). Bir yapılandırmayı doğrularken sadece kuralın varlığına değil içeriğine de bak (ruleset'te zorunlu CI listesi boş kalmıştı).

### 2026-10-31 · Hafta 2 · NestJS temelleri ve veri modeli

**Ne yaptık:** NestJS API iskeleti, env doğrulama, `/api/v1` versiyonlama, Swagger, health check (DB + Redis), Prisma 7 veri modeli + migration + seed, standart hata formatı, pino loglama + request ID, ESLint.
**Kavramlar:**

- _Module / controller / service:_ Controller HTTP isteğini alır, iş mantığı service'tedir, module ikisini gruplar.
- _Dependency injection:_ Sınıf bağımlılığını kendisi oluşturmaz, Nest verir; testte sahtesi verilebilir.
- _Fail fast:_ Hatalı ayarla uygulama hiç açılmaz, sonradan anlaşılmaz hata vermez.
- _Health check:_ Orkestratör `/api/health`'e bakar; 503 görürse trafiği keser.
- _Migration:_ Veritabanı şemasındaki her değişiklik sürümlü bir SQL dosyası; her ortam aynı şemaya gelir.
- _Request ID:_ Bir isteği istemciden log satırına kadar izlemeyi sağlar.

**Ders:** "En yeni sürüm" her zaman doğru seçim değil: NestJS 12 (yalnız ESM), TypeScript 7 ve Prisma 8 RC araç zincirini bozdu; sürümler bilinçli seçilip sabitlendi (ADR-0003).

### 2026-10-31 · Hafta 3 · Kimlik doğrulama

**Ne yaptık:** Kayıt/giriş (argon2id), kısa ömürlü JWT access token + dönen (rotating) refresh token, çıkış, e-posta doğrulama, şifre sıfırlama (Mailpit), Google ile giriş (OAuth code + PKCE).
**Kavramlar:**

- _Access / refresh token:_ Access token kısa ömürlü (15 dk) kimlik kanıtı; refresh token uzun ömürlü, `httpOnly` çerezde ve veritabanında sadece hash'i durur.
- _Refresh token rotation:_ Her yenilemede eski token iptal edilir; iptal edilmiş token geri gelirse çalınmıştır, o girişin tüm oturumları kapatılır.
- _Hash:_ Şifre ve token'lar veritabanında düz saklanmaz; sızıntı olsa bile kullanılamaz.
- _Hesap sızdırmama:_ "Şifremi unuttum" ve yanlış giriş, kayıtlı/kayıtsız e-posta için aynı cevabı verir.
- _OAuth + PKCE + state:_ Google'a yönlendirme güvenli rastgele değerlerle bağlanır; sahte callback'ler reddedilir.
- _Pre-hijacking:_ Doğrulanmamış e-postayla açılmış şifreli hesap, aynı e-postayla Google'a bağlanınca şifresi silinir.

**Ders:** Test geçmesi yetmez, gerçek servisle doğrula. Mail gönderimi ilk denemede çalışmadı: `localhost` bu ağda yerel ağ IP'sine çözülüyordu (`127.0.0.1` ile düzeldi). Google girişi de gerçek hesapla denenip veritabanından doğrulandıktan sonra merge edildi.

### 2026-10-31 · Hafta 4 · Çok kiracılık ve yetkilendirme

**Ne yaptık:** Organizasyonlar, 4 rol (OWNER > ADMIN > MANAGER > MEMBER), üye yönetimi, e-posta ile davet ve kabul, `OrganizationGuard`, tenant'a özel Prisma uzantısı, 22 izolasyon/yetki e2e testi, CI'da gerçek Postgres.
**Kavramlar:**

- _Multi-tenancy:_ Birçok şirket tek uygulamayı paylaşır; veriler `organizationId` ile ayrılır. Alternatifler: tenant başına DB, tenant başına şema, ortak şema (seçtik), RLS (ADR-0004).
- _RBAC:_ Yetki kullanıcıya değil role bağlı; roller bir merdiven (rank) oluşturur, kimse kendi seviyesinin üstüne işlem yapamaz.
- _Savunma derinliği:_ İki bağımsız katman (guard + Prisma uzantısı); biri hata yapsa diğeri yakalar.
- _404 vs 403:_ Üye olmayana 404 dönülür; böylece bir şirketin var olduğu bile sızmaz.
- _Mass assignment:_ Fazladan alanlar (`role: OWNER` gibi) reddedilir.
- _Mutasyon testi:_ Korumayı bilerek bozup testlerin başarısız olduğunu görmek, testlerin gerçekten bir şey denetlediğini kanıtlar.
- _Fail closed:_ Emin olunmayan durumda izin vermek yerine reddetmek (bilinmeyen Prisma işlemi, `:orgId` taşıyan public route).

**Ders:** Test kodundaki hata bile yanıltabilir: varsayılan parametre `undefined`'ı yutup "kullanıcısız" senaryoyu hiç denemiyordu; testin başarısız olması koddaki değil testteki hatayı gösterdi.

### 2026-10-31 · Hafta 5 · Projeler ve görevler

**Ne yaptık:** Proje ve görev CRUD'u, alt görevler, filtreleme (durum, öncelik, atanan, etiket, arama, süresi geçenler), cursor sayfalaması, soft delete, 47 e2e test, CI'da kapsam raporu.
**Kavramlar:**

- _Cursor (keyset) sayfalama:_ "Şu kayıttan sonrakini ver" der. Offset ("ilk 20'yi atla") büyük tablolarda yavaşlar ve sayfalar arasında kayıt eklenince aynı kayıt tekrar görünür ya da atlanır; cursor kararlıdır. Sıralama değeri aynı olan kayıtlar için `id` ikinci anahtar olarak kullanılır.
- _limit + 1 hilesi:_ Bir fazla satır çekilir; varsa sonraki sayfa vardır. Ayrı bir COUNT sorgusu gerekmez.
- _Soft delete:_ Kayıt silinmez, `deletedAt` dolar. Geri alınabilir ve denetlenebilir; bedeli her okuma sorgusunda filtre unutmamak (bu yüzden testlerle korunuyor).
- _PATCH ve null:_ Alan hiç gönderilmezse değişmez, `null` gönderilirse temizlenir.
- _Savunmacı tasarım:_ Atanan kişi aynı şirketten olmalı; bir şirketin kimliğiyle başka şirketin rotasında kayıt aranırsa 404.
- _Mass assignment:_ `createdById` gibi alanlar gövdede gönderilirse reddedilir.

**Ders:** Testin yeşil olması yetmez; mutasyon testiyle üç korumayı (soft delete filtresi, cursor yönü, atanan kontrolü) bozdum ve testlerin başarısız olduğunu gördüm. Bir mutasyonum geçersizdi (derleme hatası verip testleri hiç çalıştırmadı), bunu "0 test" çıktısından fark edip doğru mutasyonla tekrarladım.

**Dürüst not:** Birim test kapsamı ~%45; servis mantığı çoğunlukla e2e testlerle doğrulanıyor ve e2e kapsamı bu rakama dahil değil.

### 2026-10-31 · Hafta 6 · Bağımlılıklar, geçmiş, tekrarlayan görevler

**Ne yaptık:** Görev bağımlılıkları (döngü tespiti, durum kapısı), değişiklik geçmişi (iki sürümü karşılaştırma), tekrarlayan görevler (RRULE, zamanla tetiklenen üretim mantığı), 73 e2e test, ADR-0005.
**Kavramlar:**

- _Yönlü graf ve döngü:_ Bağımlılıklar bir graf. Yeni kenar `A -> B` ancak `B` zaten `A`'ya ulaşabiliyorsa döngü kapatır; bunu DFS ile ararız. Her düğüm bir kez gezilir: O(V+E). Yinelemeli yazdık, 50.000 görevlik zincirde bile yığın taşmıyor.
- _Yarış durumu (race condition):_ İki istek aynı anda ters kenarlar eklerse, ikisi de diğerini görmeden kontrolü geçer ve birlikte döngü yaratır. Çözüm: şirket başına **advisory lock**; yazanlar sıraya girer, kilit işlem bitince kalkar.
- _Satır kilidi (`SELECT ... FOR UPDATE`):_ İki kişi aynı görevi aynı anda düzenlerse ikinci işlem beklemek zorunda; böylece geçmiş kayıtları zincirleme tutarlı kalır (A→X, sonra X→Y).
- _Transaction:_ Değişiklik ve geçmiş kaydı ya birlikte yazılır ya hiç.
- _Olay + snapshot:_ Olay "ne değişti", snapshot "sonra nasıldı" der. İki sürümün farkı iki snapshot'tan hesaplanır.
- _Idempotency (aynı işi iki kez yapmama):_ Tekrarlayan görev üretiminde iki bağımsız katman: koşullu güncelleme ile "talep etme" ve veritabanı unique kısıtı. Biri bozulsa diğeri korur.
- _Misfire politikası:_ İş uzun süre çalışmazsa kaçırılan 30 oluşum için 30 görev değil, 1 görev üretilir.
- _RRULE:_ Takvim uygulamalarının standardı; cron "her ayın ilk pazartesisi"ni ifade edemez.

**Dersler:**

- Mutasyon testi bu hafta çok işe yaradı: kilitleri tek tek kaldırınca eşzamanlılık testleri başarısız oldu; yani testler zamanlama hatalarını da yakalıyor. Altı mutasyondan biri başta "geçti": sadece "talep etme" katmanını kaldırmıştım ve veritabanı kısıtı kopyaları yine engelledi. Bu bir test eksiği değil, iki katmanın bağımsız çalıştığının kanıtıydı; ikisini birlikte kaldırınca 6 test başarısız oldu.
- TypeScript'in yakalamadığı bir hata riski: `{ startsAt, ...dto }` yazınca, DTO'da gönderilmemiş alan `undefined` olarak durduğu için hesaplanan değeri ezebilir. Hesaplanan değerleri spread'in sonuna koymak gerekir.
- Test yazarken yanlış beklenti: şablon silinince üretilmiş görevlerin `recurringTaskId`'si bilerek NULL oluyor; testim görevleri hâlâ şablon kimliğiyle arıyordu.

**Dürüst notlar:** Birim test kapsamı ~%39'a düştü (yeni servisler ağırlıklı olarak e2e testlerle doğrulanıyor). Proje silinince görevlerin silinmesi için tek tek olay yazılmıyor; kuruluş geneli denetim kaydı Hafta 11'de.

### 2026-11-01 · Hafta 7 · Frontend temeli

**Ne yaptık:** Next.js 16 + Tailwind 4 + shadcn/ui; giriş, kayıt, şifre sıfırlama, e-posta doğrulama, Google dönüşü; korumalı alan; organizasyon seçici; proje listesi, ayrıntı, düzenleme, silme; davet kabul sayfası; API sözleşmesinden üretilen tipli istemci; 40 web testi. Tüm akışlar tarayıcıda gerçek API ve e-posta ile denendi. Karar kaydı: ADR-0006.
**Kavramlar:**

- _Sunucu ve istemci bileşeni:_ Sunucu bileşeni tarayıcıya JavaScript göndermez (başlık, statik içerik); tıklama, form ve tarayıcı durumu gereken kısım `'use client'` olur. Sayfa sunucuda, form istemcide.
- _TanStack Query:_ Sunucu verisi için önbellek. Aynı anahtarı isteyen iki bileşen tek istek paylaşır; değişiklikten sonra ilgili anahtarlar geçersiz kılınınca ekranlar kendini günceller. `useEffect` + `fetch` ile bunların hepsini elle yazmak gerekir (yükleme durumu, yarış, önbellek, yeniden deneme).
- _Token bellekte, refresh çerezde:_ XSS çerezi okuyamaz; sayfa yenilenince token çerezle geri alınır.
- _Refresh rotation tuzağı:_ Aynı anda iki yenileme isteği, çalınma alarmını yanlışlıkla tetikler. Çözüm: tek çağrı + Web Locks ile sekme sırası.
- _Açık yönlendirme (open redirect):_ `?next=` değeri URL'den geldiği için yalnızca site içi yollar kabul edilir.
- _Tipli istemci:_ OpenAPI'den üretilen tipler yanlış yolu ve gövdeyi derleme hatası yapar.
- _Rol bazlı arayüz:_ Düğmeleri gizlemek güvenlik değil, kullanım kolaylığıdır; yetkiyi API denetler.

**Dersler:**

- Tipli istemci sözleşmedeki gerçek bir hatayı yakaladı: `string | null` alanları API belgesinde "nesne" görünüyordu (Swagger birleşim tipini okuyamıyor, `type` açıkça yazılmalı).
- CI'da çalışıp yerelde çalışmayan şey çoğunlukla yerelde zaten var olan bir şeyle maskelenir: üretim betiği yerel `.env` sayesinde çalışıyordu, CI'da `app.module` yüklenirken ortam doğrulaması patladı. CI koşullarını yerelde yeniden üretmek (`.env` olmadan) sorunu gösterdi.
- Bir araç (shadcn CLI) kendi başına yeni bir bağımlılık (`cn`) ekledi; sahibini doğrulayamadığım için almadım, 3 satırlık kendi yardımcımı tuttum.
- Gizli tarayıcı paneli animasyonları dondurur ve tıklamalar başarısız olur; paneli görünür yapınca düzeldi (uygulama hatası değildi).
- Elle denerken görülen şüpheli durum (form `GET`): sayfa hazır olmadan gönderilirse bilgiler adrese düşer. Formlar `method="post"` yapıldı.

**Dürüst notlar:** Tarayıcı uçtan uca testi (Playwright) yok, akışlar elle denendi. Görev yanıtları henüz sözleşmede yok (Hafta 8).

**Sonraki adım:** Hafta 8, Kanban panosu ve görev arayüzü (sürükle-bırak, fractional indexing, optimistic update).

### 2026-11-01 · Hafta 8 · Kanban ve görev arayüzü (M2)

**Ne yaptık:** API: pano (`GET .../board`) ve taşıma (`POST .../move`) uç noktaları, fractional index ile kalıcı sıralama, görev yanıt şemalarının sözleşmeye eklenmesi. Web: sürükle-bırak Kanban panosu (klavyeyle de çalışır), optimistic taşıma + hata olunca geri alma, görev detay penceresi (alanlar, alt görevler, bağımlılıklar, geçmiş, silme), filtreli liste görünümü. Karar kaydı: ADR-0007.
**Kavramlar:**

- _Fractional indexing:_ Sırayı 1, 2, 3 yerine iki komşunun arasında kalan bir metin anahtarıyla tutmak. Araya koymak tek satır güncellemesi; tam sayıda altındaki herkes kayardı ve iki kişi çakışırdı. Anahtar uzarsa sütun yeniden numaralandırılır.
- _Konumu sunucu hesaplar:_ İstemci sadece "şu kartın arkasına" der (`afterId`); eski bir pano görüntüsü bozuk anahtar üretemez.
- _Optimistic update:_ Kart hemen yer değiştirir, istek arkadan gider. `onMutate`'te önceki hâl saklanır, `onError`'da geri konur, `onSettled`'da sunucunun gerçeğiyle yenilenir.
- _dnd-kit erişilebilirliği:_ Sürükleme için ayrı bir tutamak (kartın kendisi "aç" düğmesi kalır), Boşluk ile al, ok tuşlarıyla taşı, Boşluk ile bırak; ekran okuyucuya duyuru yapılır.
- _Sözleşme tamamlama:_ Swagger yalnızca `@Param` ile okunan yol parametrelerini belgeliyordu; `orgId`'yi okumayan rotalarda eksikti. Üretim betiği yoldaki her `{param}`'ı tamamlıyor.

**Dersler:**

- Birim test gerçek bir hatayı yakaladı: bilinmeyen `afterId` ile taşıma, kartı kaynak sütundan silip hedefe koymuyordu (kart kayboluyordu). Doğrulama başa alındı.
- Mutasyon testi: bağımlılık kapısı, yeniden numaralandırma ve `afterId`'nin sütunla sınırlanması tek tek kaldırıldı, her seferinde bir test kırıldı.
- Tarayıcıdaki otomasyon aracı gerçek sürükle-bırak olaylarını güvenilir üretemedi. Bunun yerine mantığı saf fonksiyona (`moveInBoard`, `placementFor`) ve hook'a ayırıp ayrı ayrı test ettim; detay penceresi, alt görev, bağımlılık ve 409 hata gösterimi ise tarayıcıda elle denendi.
- `openapi-typescript` varsayılan değerli alanları istekte zorunlu gösteriyordu; `--default-non-nullable false` ile düzeldi.

**Dürüst notlar:** Gerçek fare/klavye sürükleme akışı bu oturumda otomasyonla uçtan uca doğrulanamadı (parçaları test edildi); Playwright ile Hafta 13'te kapatılacak. Panoya gerçek zamanlı güncelleme yok (Hafta 10).

**Sonraki adım:** Hafta 9, işbirliği (yorumlar, bahsetmeler, bildirimler).

### 2026-11-01 · Hafta 9 · İşbirliği

**Ne yaptık:** API: görev yorumları (düzenleme, silme), `@mention`, kişiye özel bildirimler (mention, atama), proje ve organizasyon aktivite akışı, domain event altyapısı. Web: görev penceresinde yorumlar ve mention seçici, başlıkta bildirim zili (okunmamış sayacı, "tümünü okundu yap", tıklayınca ilgili görev açılır), "Activity" sekmesi. Karar kaydı: ADR-0008.
**Kavramlar:**

- _Domain event:_ Servis "görev atandı" der; bildirimi kimin üreteceğini bilmez. Yeni tepki (canlı güncelleme, e-posta) eklemek olayı üreten servisi değiştirmez. Olaylar commit'ten **sonra** yayınlanır; dinleyici hatası isteği bozmaz, loglanır.
- _Aktivite akışı ≠ audit log:_ Akış "ekip ne yapıyor?" sorusunun cevabı (görev geçmişinin proje geneli); audit log güvenlik açısından önemli her eylemin kanıtıdır (Hafta 11).
- _Mention biçimi `@[Ad](id)`:_ Kimlik esas, ad sadece görüntü. Sadece şirket üyeleri bildirim alır; yabancı ya da uydurma kimlik düz metin olur ve kişinin var olup olmadığı sızmaz.
- _Yetki "rol" değil "sahiplik" olabilir:_ Yorumu yalnızca yazarı düzenler (OWNER bile edemez); silmeyi yazar ya da MANAGER+ yapar.
- _Bildirimler kişiye özel:_ Her sorgu şirket + alıcıya göre süzülür; başkasının bildirimi 404.
- _Türetilmiş state:_ Bildirimden gelen `?task=` bağlantısını state'e kopyalayan `useEffect` yerine, açık görevi iki state'ten hesapladım (lint kuralı `set-state-in-effect` doğru yöne itti).

**Dersler:**

- Mutasyon testinde iki mutant hayatta kaldı: biri testin yanlış şirkette arama yapması, diğeri mutantın derleme hatası vermesi yüzünden hiç çalışmamasıydı. "0 test çalıştı" bir geçiş değildir. Ayrıca toplu eklemedeki tek bir geçersiz kimlik (FK) bütün satırları düşürüp gerçek hatayı maskeledi; testi ayırdım.
- `@nestjs/event-emitter` 12 de yalnızca ESM çıktı; Nest 11 için 3.x sabitlendi (ADR-0003'teki kural).
- Gerçek bir hata değil ama öğretici: `heredoc` içinde tek tırnaklı Türkçe/İngilizce metin kabuğu bozabiliyor; dosya yazmak için Write aracı daha güvenli.

**Dürüst notlar:** Olaylar bellekte yaşar: commit ile dinleyici arasında süreç çökerse bildirim kaybolur. Hafta 10'da BullMQ ile kalıcı hale gelecek (ADR-0008'de yazılı). Zil şimdilik 30 saniyede bir sorgular; canlı itme Hafta 10'da (Socket.IO). Yorum listesi tek sayfa (100); sonsuz kaydırma yok.

**Sonraki adım:** Hafta 10, arka plan işleri (BullMQ) ve gerçek zamanlı güncelleme (Socket.IO).
