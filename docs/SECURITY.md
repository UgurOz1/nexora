# Güvenlik gözden geçirmesi (OWASP Top 10, 2021)

Bu belge, [OWASP Top 10](https://owasp.org/Top10/) listesini NEXORA'nın bugünkü haline göre tek tek yanıtlar: **ne yapıldı, nerede, neyi yapmadık.** Dürüst olmak için "açık" başlığı olan maddeler bilerek bırakıldı. Son gözden geçirme: Hafta 11 (2026-11-04).

| #   | Risk                                    | Durum                    | Özet                                                               |
| --- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| A01 | Bozuk erişim denetimi                   | Karşılandı               | Rol merdiveni + tenant izolasyonu, testli                          |
| A02 | Kriptografik hatalar                    | Büyük ölçüde             | argon2id, token özetleri; TLS dağıtımda                            |
| A03 | Enjeksiyon                              | Karşılandı               | Prisma parametreli sorgu, DTO doğrulama                            |
| A04 | Güvensiz tasarım                        | Karşılandı               | Tehdit odaklı kararlar (ADR'ler), hız sınırı, kilitler             |
| A05 | Güvenlik yanlış yapılandırması          | Kısmen                   | helmet, CORS, env doğrulama; web CSP **açık**                      |
| A06 | Savunmasız ve eski bileşenler           | Açık                     | Bağımlılık taraması CI'da yok                                      |
| A07 | Kimlik doğrulama hataları               | Karşılandı               | Rotasyonlu refresh token, hız sınırı, kullanıcı numaralandırma yok |
| A08 | Yazılım ve veri bütünlüğü hataları      | Kısmen                   | Kilit dosyası, CI; imzalı derleme yok                              |
| A09 | Güvenlik günlüğü ve izleme hataları     | Karşılandı / izleme açık | Audit log + yapılandırılmış log; uyarı/alarm yok                   |
| A10 | Sunucu taraflı istek sahteciliği (SSRF) | Uygulanamaz (şimdilik)   | Sunucu, kullanıcının verdiği URL'ye istek atmıyor                  |

## A01 · Bozuk erişim denetimi

- **Rol merdiveni** (OWNER > ADMIN > MANAGER > MEMBER) ve "kimin üzerinde" kuralları kodda saf fonksiyonlar ([policies.ts](../apps/api/src/organizations/policies.ts)); belge: [PERMISSIONS.md](PERMISSIONS.md).
- **Tenant izolasyonu iki katmanda:** global `OrganizationGuard` (üye değilse 404) ve her sorguya `organizationId` ekleyen `forTenant` uzantısı (fail-closed; bilinmeyen işlem reddedilir). Başka şirketin verisine erişim e2e testlerle her özellikte denendi.
- **Varsayılan kapalı:** Global `JwtAuthGuard`; `@Public()` açıkça yazılmayan hiçbir rota anonim değil.
- **WebSocket:** Kimlik bağlanırken, yetki odaya girerken (ADR-0009). Olaylar içerik taşımaz.
- **Mass assignment:** `ValidationPipe` `whitelist + forbidNonWhitelisted`; DTO'da olmayan alan reddedilir.
- **Bilinen sınır:** Üyelikten çıkarılan kişi, açık WebSocket'i en çok 15 dakika (token ömrü) eski odaları dinleyebilir.

## A02 · Kriptografik hatalar

- Parolalar **argon2id** (kütüphane varsayılanları, OWASP önerisi). Düz parola hiçbir yerde saklanmaz ve loglanmaz (audit testi bunu doğrular).
- E-posta/parola sıfırlama/davet/refresh token'ları yalnızca **özet (hash)** olarak saklanır; sızan veritabanı ile kullanılamaz.
- Access token HS256, algoritma sabit (`none` reddedilir), 15 dk; sır en az 32 karakter (env doğrulaması).
- **Açık:** TLS dağıtımda ters vekil ile sağlanacak (Hafta 13). Refresh çerezi `httpOnly`, `sameSite`; üretimde `secure`.

## A03 · Enjeksiyon

- Tüm veritabanı erişimi Prisma ile, parametreli. Ham SQL yalnızca üç yerde: sağlık kontrolü (`SELECT 1`), advisory lock ve satır kilidi (`FOR UPDATE`). Değerler etiketli şablonla bağlanır (`$executeRaw\`...${x}\``), `Unsafe` varyantı hiçbir yerde kullanılmaz.
- Girdi: `class-validator` ile tip, uzunluk, enum sınırı. Yorumlar React'te düz metin olarak çizilir (`dangerouslySetInnerHTML` yok), mention işaretlemesi HTML değil.
- Arama (Hafta 11) tsvector ile, kullanıcı metni `plainto_tsquery`/parametre; `LIKE` birleştirme yok.

## A04 · Güvensiz tasarım

- Her ciddi karar bir ADR'de, tehdit gerekçesiyle (döngü tespiti kilidi, "talep etme" deseni, refresh token rotasyonu + tek çağrı).
- **Hız sınırı** (ADR-0010): giriş/kayıt/e-posta uçları ve genel API; Redis çökerse açık geçiş (bilinçli).
- Kritik değişiklikler tek işlemde (`FOR UPDATE`, koşullu güncelleme): yarış koşulları testle kanıtlandı.

## A05 · Güvenlik yanlış yapılandırması

- **API:** `helmet`; `X-Powered-By` yok; CORS yalnızca `APP_URL` kökeni (WebSocket'te); ortam değişkenleri başlangıçta doğrulanır, eksikse uygulama açılmaz.
- **Web:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Açık:** Web için `Content-Security-Policy` yok (Next.js satır içi betikleri için nonce gerekir). Yapılacak: middleware ile nonce üretip `script-src 'nonce-…' 'strict-dynamic'`.
- **Açık:** Swagger (`/api/docs`) üretimde de açık; üretimde kapatılmalı ya da korunmalı (Hafta 13 dağıtım listesinde).

## A06 · Savunmasız ve eski bileşenler

- Kilit dosyası (`pnpm-lock.yaml`), CI'da `--frozen-lockfile`. Sürümler bilinçli sabitlendi (ESM-only sürümlerden kaçınmak için, ADR-0003).
- **Açık:** CI'da `pnpm audit` ya da Dependabot yok. Yapılacak: Dependabot + haftalık `pnpm audit`.

## A07 · Kimlik doğrulama hataları

- Kullanıcı numaralandırma yok: yanlış e-posta/yanlış parola aynı mesaj, bilinmeyen e-postada da parola doğrulama süresi harcanır (zamanlama sızıntısı yok); parola sıfırlama ve doğrulama uçları aynı cevabı verir.
- **Refresh token rotasyonu:** Her kullanım eskisini iptal eder; iptal edilmiş token'ın yeniden sunulması çalınma sayılır, tüm oturum kapanır. Parola sıfırlayınca tüm oturumlar kapanır.
- **Giriş denemeleri sınırlı:** IP başına ve hesap başına (ADR-0010). Başarısız girişler audit log'da.
- Google OAuth: PKCE + `state`; yalnızca Google'ın doğruladığı e-posta kabul edilir.
- **Açık:** İki aşamalı doğrulama (2FA) yok. Parola gücü: yalnızca uzunluk (8-128); sızdırılmış parola listesi kontrolü yok.

## A08 · Yazılım ve veri bütünlüğü hataları

- CI her PR'da biçim, lint, tip, test, derleme ve üretilmiş sözleşme güncelliğini denetler; `main` korumalı (PR + yeşil CI).
- **Açık:** Derleme çıktıları ve imajlar imzalanmıyor; CI aksiyonları commit SHA'ya sabitlenmedi (etiketle çağrılıyor).

## A09 · Güvenlik günlüğü ve izleme hataları

- **Audit log** (ADR-0010): girişler, başarısız girişler, rol/üye/davet/proje silme değişiklikleri; yalnızca eklenir, OWNER/ADMIN okur.
- Her denetim olayı ayrıca **yapılandırılmış log** satırıdır (veritabanı çökse de iz kalır). İstek kimliği (`x-request-id`) her satırda.
- **Açık:** Alarm/uyarı yok (ör. "5 dakikada 50 başarısız giriş"). Hafta 12'de metrik ve gözlemlenebilirlik ile birlikte ele alınacak.

## A10 · SSRF

- Sunucu, kullanıcının verdiği bir URL'ye istek atmıyor. Giden istekler sabit: SMTP, Google OAuth uçları. **Dosya yükleme (Hafta 11)** presigned URL'yi _istemci_ kullanır; sunucu kullanıcı URL'sini çekmez. Webhook/URL içe aktarma eklenirse bu madde yeniden açılır.

## Öncelikli açıklar

1. Web `Content-Security-Policy` (nonce).
2. Bağımlılık taraması (Dependabot + `pnpm audit`).
3. Üretimde Swagger'ı kapatma/koruma.
4. Başarısız giriş uyarısı (Hafta 12).
5. 2FA (kapsam dışı olabilir; ürün kararı).
