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

**Sonraki adım:** Hafta 6, ileri görev özellikleri (görev bağımlılıkları ve döngü tespiti, değişiklik geçmişi, tekrarlayan görevler).
