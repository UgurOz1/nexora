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

### 2026-11-04 · Hafta 10 · Arka plan işleri ve gerçek zamanlı

**Ne yaptık:** API: BullMQ kuyrukları (e-posta, bildirim, tekrarlayan görev, ölü mektup), yeniden deneme + üstel bekleme, dakikada bir çalışan zamanlanmış iş, Socket.IO ağ geçidi (token ile kimlik, odaya girerken yetki kontrolü, token bitince bağlantıyı kapatma, Redis adapter). Web: tek bağlantı yöneten `RealtimeClient` (yeniden bağlanınca odalara tekrar girer, süresi biten token'ı yenileyip bağlanır), board ve bildirim zilinin canlı güncellenmesi. Karar kaydı: ADR-0009.
**Kavramlar:**

- _Kuyruk neden:_ İstek SMTP'yi beklemez, SMTP düşse istek bozulmaz; iş Redis'te durur, işçi alır, başarısızsa 1 s, 2 s, 4 s, 8 s sonra tekrar dener. Tüm denemeler biterse iş **ölü mektup** kuyruğuna kopyalanır: kaybolmaz.
- _En az bir kez teslim:_ İşçi yazıp onaydan önce ölürse iş tekrar çalışır; çift bildirim olabilir. Para gibi işler için idempotency anahtarı gerekir.
- _Job scheduler:_ Zamanlama Redis'te; on sunucu da başlasa dakikada **bir** iş üretilir. `@nestjs/schedule` (cron) her sunucuda ayrı çalışırdı.
- _WebSocket yetkisi iki yerde:_ Kim olduğun **bağlanırken** bir kez (token), ne dinleyebileceğin **odaya girerken** (veritabanı). Bağlanmak tek başına hiçbir şey vermez.
- _Olay içerik taşımaz:_ "Bir şey değişti, tekrar bak" der; veri normal API'den, yetki kontrolüyle gelir. WebSocket yeni bir sızıntı yüzeyi açmaz.
- _Redis adapter:_ A sunucusundaki `emit`, Redis pub/sub ile B sunucusundaki tarayıcıya ulaşır. İki gerçek uygulama örneğiyle testte kanıtlandı.
- _Token ömrü ve açık soket:_ Soket 15 dakikalık token'dan uzun yaşamasın diye sunucu süre bitince kapatır, tarayıcı token'ı yenileyip bağlanır.

**Dersler:**

- Mutasyon testi 10 korumayı tek tek kaldırdı, hepsi yakalandı. Ama önce testlerin kendisi iki yerde yanlıştı: ölü mektup kuyruğundaki iş hiç tüketilmediği için "kuyruk boşta mı?" kontrolü sonsuza kadar bekliyordu; ortam ayarı `ConfigModule` modül yüklenirken okunduğu için testte `process.env` değiştirmek işe yaramıyordu.
- Beklemek için `sleep` yerine `whenIdle()` (kuyruklar boşalana kadar): test hem hızlı hem kararlı.
- Çalışan sistemde ölçmek işe yaradı: sayfayı yenilemeden, başka kullanıcı API'den görev oluşturunca kart göründü ve zil "1" oldu.
- Optimistic sürükleme sırasında başka bir canlı olay gelirse kart bir an eski yerine dönebilirdi; devam eden bir değişiklik varken canlı yenileme beklemeye alındı (o değişikliğin kendi yenilemesi her şeyi getirir).
- Kökten `eslint . --fix` üretilmiş `schema.d.ts`'yi yeniden biçimlendiriyor; hedefli çalıştırılmalı (CI'ı bir kez kırmıştı).

**Dürüst notlar:** Üyelikten çıkarılan kişi, soketi yeniden bağlanana kadar (en çok 15 dk) eski odaları dinleyebilir. Commit ile Redis'e `add` arasındaki an hâlâ kapsanmıyor (tam çözüm transactional outbox). İşçiler API sürecinin içinde çalışıyor; ayrı sürece alınabilir. Sürükle-bırağın gerçek fare/klavye akışı hâlâ elle denenmedi (Playwright Hafta 13).

**Sonraki adım:** Hafta 11, dosya yükleme (S3), tam metin arama, rate limiting, audit log.

### 2026-11-04 · Hafta 11 · Dosyalar, arama, güvenlik

**Ne yaptık:** Üç parça, üç PR. (1) Güvenlik: Redis'te Lua ile atomik token bucket hız sınırı (giriş için IP ve hesap bazlı), audit log (`@Audited` dekoratörü + interceptor, OWNER/ADMIN okur, arayüzü var), helmet ve web güvenlik başlıkları, OWASP gözden geçirmesi (`docs/SECURITY.md`). (2) Arama: Postgres `tsvector` (veritabanının ürettiği sütun) + GIN indeks, önek eşleşmesi, sıralama, arama sayfası. (3) Dosya ekleri: SeaweedFS (S3), imzalı URL ile tarayıcıdan doğrudan yükleme, tür izin listesi, ilk bayt doğrulaması, `attachment` olarak indirme, yarım yüklemeleri temizleyen zamanlanmış iş. Kararlar: ADR-0010, 0011, 0012.
**Kavramlar:**

- _Token bucket vs sabit pencere:_ Sabit pencerede sınırda 2 kat patlama geçer; token bucket'ta uçurum yok, kısa patlamaya izin verip ortalamayı sınırlar. Oku-yenile-harca tek Lua betiği olduğu için iki istek aynı jetonu harcayamaz (25 eşzamanlı istek, kapasite 5 → tam 5 geçti). Redis çökerse "açık geçiş" (bilinçli).
- _Audit log ≠ aktivite akışı:_ Akış "ne üzerinde çalışılıyor", audit "kim neyi yaptı, kanıtla". Yalnızca eklenir; şirket silinince "silindi" kaydı şirketsiz (`organizationId = null`) kalır.
- _`LIKE '%x%'` neden yavaş:_ Joker ile başlayan desen sıradan indeksi kullanamaz, her satırı okur. GIN indeksi kelime → satır eşler. Üretilmiş `tsvector` sütunu uygulamanın güncellemeyi unutmasını imkânsız kılar; bir test sorgu planında indeksin kullanıldığını kanıtlar.
- _Dosyayı neden API'den geçirmiyoruz:_ Bellek/bant genişliği/işçi tutar. İmzalı URL: sunucu kısa ömürlü bir izin verir, tarayıcı dosyayı depolamaya kendisi yollar. Karşılığında içeriği API görmez, bu yüzden tamamlarken kendisi bakar.
- _Yüklenen dosyaya güvenme:_ Tür başlığı ve uzantı yükleyenin seçimi. İzin listesi + imzaya bağlı tür/boyut + ilk bayt (magic number) + `Content-Disposition: attachment` + sunucuda üretilen yol.
- _Ham SQL ve tenant izolasyonu:_ `forTenant` yalnızca Prisma model metotlarını sarar; ham sorguda `organizationId` filtresi elle yazılır ve testle korunur.

**Dersler:**

- İki kez dosyayı yanlış yere yazdım: bir betiğin çalışma dizini yüzünden denetim sayfası `apps/web/src/src/...` altına gitti, PR'a girdi ve rota 404 verdi. Tarayıcıda açmadan "bitti" demiştim; arama PR'ında fark edip düzelttim. Ders: arayüz değişikliğini her zaman çalışırken aç.
- Depolama sunucusunu varsaymadan önce yoklama betiği yazdım: SDK'nın yeni sağlama toplamı davranışı (400), imzanın tür/boyutu varsayılan olarak zorlamaması (ama `signableHeaders` ile zorluyor) ve `localhost` → IPv6 sağlık kontrolü sorunu ancak denenince çıktı.
- Mutasyon testi yine eksik testleri buldu: "silinmiş projenin görevleri" filtresi, proje silme görevleri de sildiği için hiç sınanmıyordu (doğrudan veritabanı güncellemesiyle test eklendi). Kayıt dışı kalan iki mutant gerekçeleriyle açıklandı (derleme hatası; çift katmanlı korumanın ilki).
- `eslint . --fix` kökten çalışınca üretilmiş `schema.d.ts`'yi yeniden biçimlendiriyor; her seferinde yeniden üretmek gerekti.
- Bash heredoc'ta ters eğik çizgiler (regex) bozulabiliyor; regex içeren dosyaları Write aracıyla yazmak daha güvenli.

**Dürüst notlar:** CSP yok (Next.js nonce gerekir), bağımlılık taraması yok, Swagger üretimde açık: hepsi `docs/SECURITY.md`'de öncelik listesinde. Etiketler aranmıyor, yorumlar aranmıyor. Virüs taraması yok. Gerçek tarayıcıda dosya yükleme (CORS dahil) elle denendi ve çalıştı; Playwright ile Hafta 13'te otomatiğe bağlanacak.

**Sonraki adım:** Hafta 12, analitik ve gözlemlenebilirlik (esnek hafta).

### 2026-11-10 · Hafta 12 · Analitik ve gözlemlenebilirlik

**Ne yaptık:** Dashboard (durum dağılımı, gecikenler, günlük tamamlanan/oluşturulan grafiği, proje, departman ve kişi bazlı tablolar; kişi tablosu MANAGER ve üstü), görevlere veritabanı tetikleyicisiyle tutulan `completedAt`, Redis cache (sürümle geçersiz kılma), `EXPLAIN ANALYZE` ile iki kısmi + kapsayan indeks, Prometheus metrikleri (`/api/metrics`), 1 milyon görevlik veri üretme betiği ve k6 yük testi. Kararlar: ADR-0013. Rakamlar: `docs/PERFORMANCE.md`.
**Kavramlar:**

- _Cache invalidation:_ Anahtar silmek yerine şirket başına sürüm sayacı; değişiklikte sayaç artar, eski girdiler okunmaz olur ve kendiliğinden sona erer. Değişiklikten önce başlamış yavaş hesaplama, sonucunu kimsenin okumadığı eski anahtara yazar: "sil, sonra bayat veri geri yazılsın" yarışı yok. TTL, yazma olmadan değişen sayıların (gece yarısı gecikmiş olan görev) üst sınırı.
- _Cache stampede:_ Aynı anda kaçıran istekler tek bir hesaplamayı paylaşır (single-flight).
- _Index her zaman iyi midir?_ Hayır. Kısmi + kapsayan indeksler dashboard'u ~5 kat hızlandırdı, ama 130 MB yer kaplıyor ve toplu eklemeyi ~1,5 kat yavaşlattı. Mevcut `(organizationId, createdAt)` indeksi %25 seçicilikte kullanılmadı ve planlayıcı haklıydı: eşleşen satırlar her sayfaya dağılmıştı.
- _Index-only scan:_ Sorgunun okuduğu her sütun indekste ve indeksin koşulu sorgunun WHERE'inden çıkarılabiliyorsa tabloya hiç gidilmez (`Heap Fetches: 0`). Görünürlük haritası (`VACUUM`) güncel değilse yine tabloya bakılır.
- _Kısmi indeks eşleşmesi:_ Postgres kısmi indeksi ancak sorgunun koşulunun indeksinkini kapsadığını kanıtlayabilirse kullanır; sorgular indeksin koşulunu kelimesi kelimesine tekrarlıyor.
- _Metrik etiketlerinde kardinalite:_ Etiket olarak gerçek URL değil route şablonu; her farklı değer ayrı bir zaman serisi.
- _p95 neden ortalama değil:_ Ortalama yavaş kuyruğu gizler; kullanıcıların %5'inin yaşadığı gecikme p95'tir.

**Dersler:**

- Yük testi, birim/e2e testlerin göremediği bir sorunu buldu: Prisma'nın `_count`'u 20 satırlık liste için bütün tablonun (1 M satır) alt görevlerini sayıyordu. Postgres'te `log_min_duration_statement` açınca üretilen SQL görüldü. Sayımlar, satır kimlikleriyle sınırlı `groupBy` sorgularına taşındı: board p95 7,6 s → 191 ms.
- "Önce ölçümü ölç": API'nin logu PowerShell `*>` yönlendirmesinden geçerken olay döngüsü bekliyordu; düz dosya yönlendirmesiyle p95'ler 4–7 kat düştü. Bir ölçüm şaşırtıcıysa ortamdan şüphelen.
- Yük senaryosu gerçekçi olmalı: her başlıkta geçen kelimeyle arama en kötü durumdur, tipik değil. İkisi de belgelendi.
- Tetikleyicide yorumla kod uyuşmuyordu ("verilen değer korunur" yazıyordu ama güncellemede eziliyordu); e2e test yakaladı.
- Docker'da Postgres'in paylaşımlı belleği 64 MB: paralel `VACUUM` hata verdi, `PARALLEL 0` ile çözüldü.
- Gizli tarayıcı panelinde `ResizeObserver` hiç bildirim göndermedi ve grafik çizilmedi. Genişlik artık efekt içinde hemen de ölçülüyor.

**Dürüst notlar:** Günler UTC'ye göre. Arayüz ekran görüntüsüyle kontrol edilmedi (tarayıcı paneli gizliydi); sayfa içi kontrollerle doğrulandı. Her başlıkta geçen kelimeyle arama hâlâ 0,5–1 s. Seed verisinde bitiş zamanı "şimdi"ye kırpıldığı için bugünün tamamlanan sayısı yapay olarak yüksek.

**Sonraki adım:** Hafta 13: yayına alma, Playwright e2e (gerçek sürükle-bırak dahil), demo verisi ve README.
