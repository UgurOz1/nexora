# ADR-0010: İstek sınırlama, audit log ve güvenlik başlıkları

- **Tarih:** 2026-11-04
- **Durum:** Kabul edildi

## Bağlam

Hafta 11'in güvenlik kısmı: parola denemelerini ve e-posta bombalamayı yavaşlatmak, "kim neyi ne zaman yaptı" sorusuna cevap verebilmek, tarayıcıya güvenli başlıklar göndermek.

## 1. Rate limiting: Redis'te token bucket

**Algoritma:** Kova `capacity` jeton tutar, saniyede `refillPerSecond` jeton kazanır, her istek bir jeton harcar; kova boşsa 429 + `Retry-After`. _Alternatif sabit pencere_ ("dakikada 100, dakika başında sıfırlanır"): pencere sınırında 12:00:59'da 100 + 12:01:00'da 100 istek geçer (2 kat patlama); token bucket'ta bu uçurum yok, kısa patlamaya izin verirken ortalama hızı sınırlar. _Alternatif sliding window log:_ doğru ama her istek için bellek tutar.

**Atomiklik:** Oku-yenile-harca-yaz döngüsü Redis'te **tek Lua betiği**dir. Redis betikleri sırayla çalıştırır; iki istek (ya da iki API sunucusu) aynı jeton sayısını okuyup ikisi de harcayamaz. Saat Redis'in kendi `TIME`'ıdır, sunucular arası saat farkı sorun olmaz. Anahtar, kova dolana kadar yaşar ve kendiliğinden silinir. e2e testte 25 eşzamanlı istek, kapasite 5 olan kovadan tam 5 jeton aldı.

**Kimin sayacı:** Giriş yapmış kullanıcı **kimliğine** göre (ofis ağındaki herkes tek bütçeyi paylaşmaz), anonimler **IP**'ye göre. Hassas uç noktalarda (giriş, parola sıfırlama isteği) ek olarak **e-posta adresine** göre: tek bir hesaba çok IP'den saldırı ya da tek bir kutuya mail yağdırma. Giriş: 5 deneme, sonra 12 sn'de bir. Kayıt: saatte 5. E-posta gönderen uçlar: saatte 3. Normal API: 120 patlama, saniyede 2.

**Redis çökerse:** İstekler **geçirilir** ("fail open") ve hata loglanır. Bir önbellek kesintisi tüm API'yi düşürmemeli. Bedeli: kesinti süresince sınır yok; kabul edildi.

**Proxy ve IP:** `TRUST_PROXY` (kaç ters vekil var). Yanlış yüksek verilirse istemci `X-Forwarded-For` ile kendi IP'sini seçip sınırı aşar; sıfırsa herkes vekilin IP'sine benzer. Varsayılan 0.

**Anahtar öneki:** Redis anahtarları `QUEUE_PREFIX` ile başlar; test koşuları birbirinin kovasını tüketmez.

## 2. Audit log

Ayrı bir tablo (`audit_logs`), yalnızca eklenir: kim (`actorId`), ne (`action`), neye (`targetType/targetId`), ayrıntı (`metadata`), nereden (`ip`, `userAgent`), ne zaman. API'de değiştirme ya da silme yolu yoktur. Ekip aktivite akışından (ADR-0008) farklıdır: akış "ne üzerinde çalışılıyor", audit "kim neyi yaptı, kanıtla".

**`@Audited` dekoratörü + global interceptor:** Hangi rotanın kayda geçtiği rotanın yanında görünür; servisler denetimden habersizdir (imzaları değişmez, testleri bozulmaz). Başarıda eylem kaydedilir; giriş gibi bazı rotalarda **reddedilme** (401/403) ayrı eylem olur (`auth.login_failed`). Doğrulama hatası (400) ya da bulunamadı (404) kayıt değildir.

**Neler kayıtlı:** giriş, başarısız giriş (denenen e-posta, **asla parola değil**), kayıt, her yerden çıkış, parola sıfırlama isteği/tamamlama, şirket oluşturma/silme, davet etme/geri alma/kabul, rol değiştirme, üye çıkarma/ayrılma, proje silme.

**Şirket silinince:** Şirketin kayıtları onunla birlikte silinir (FK cascade). "Şirket silindi" kaydı ise `organizationId = null` ile tutulur: kimin sildiğini bilmek gerekir ve kayıt silinen şeye bağlı kalmamalı. Şirketsiz olaylar (giriş, parola sıfırlama) da `organizationId = null`'dır ve şu an arayüzde gösterilmez; yalnızca veritabanında ve log akışında.

**Yazma hatası:** Önce **her zaman** yapılandırılmış log satırı (`audit ...`) basılır; veritabanı yazması başarısız olursa loglanır ve istek **bozulmaz** (iş zaten yapıldı). Bedeli: veritabanı o anda çökmüşse satır tabloda olmaz, ama log akışında vardır. Alternatif "denetim yazılamazsa işlemi iptal et" (fail closed): daha katı, ama bir yan tablo yüzünden her şeyi durdurmak bu ölçekte fazla.

**Görüntüleme:** `GET /organizations/:orgId/audit-logs` yalnızca OWNER ve ADMIN (başkaları 403, yabancı şirket 404), filtre (eylem, kişi), imleçle sayfalama.

**Bilinen sınırlar:** Kayıt HTTP katmanındadır; arka plan işlerinin (ör. zamanlanmış üretim) yaptıkları kayda geçmez. Kullanıcıya "kendi giriş geçmişin" ekranı yok (veri hazır).

## 3. Güvenlik başlıkları

- **API:** `helmet` (nosniff, çerçevelemeyi engelleme, HSTS, `X-Powered-By` kaldırma …). `Content-Security-Policy` kapalı: API JSON döner, CSP tarayıcı belgeleri içindir ve Swagger sayfası satır içi betik ister.
- **Web (Next.js):** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. **CSP yok:** Next.js'in satır içi betikleri için nonce altyapısı gerekir; `docs/SECURITY.md`'de açık iş olarak duruyor.

## Sonuçlar

- Yeni bir hassas rota: `@RateLimit(...)` ve/veya `@Audited(...)` eklenir.
- Testler sınırlayıcıyı kapalı başlatır (çok giriş yaparlar); sınır testleri `limiter.enabled = true` ile kendileri açar.
