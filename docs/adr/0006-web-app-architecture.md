# ADR-0006: Web uygulaması mimarisi

- **Tarih:** 2026-11-01
- **Durum:** Kabul edildi

## Bağlam

Web uygulaması (Next.js) ile API (NestJS) arasında kimlik doğrulama, istek yönlendirme ve tip güvenliği kararları gerekiyordu.

## Kararlar

### 1. Token saklama: access token bellekte, refresh token httpOnly çerezde

Access token (15 dk) yalnızca JavaScript belleğinde tutulur; `localStorage`'a veya okunabilir çereze konmaz. Sayfa yenilenince `POST /auth/refresh` ile httpOnly çerezden yeniden alınır.

- **Neden:** Sayfaya sızan bir script (XSS) bellekteki token'ı ancak o anda çalışırken kullanabilir, kalıcı olarak çalamaz; httpOnly çerezi ise hiç okuyamaz.
- **Alternatif:** `localStorage`. Basit ama XSS ile kalıcı çalınır. Reddedildi.
- **Bedel:** Token bellekte olduğu için sunucu, sayfayı render ederken kimin istediğini bilemez; korumalı sayfaların kapısı tarayıcıda (`RequireAuth`) çalışır. Veriyi koruyan API'dir (401), kapı yalnızca ekranı gizler.

### 2. Refresh: tek çağrı + sekmeler arası kilit

Refresh token her kullanımda döner ve eski token'ın tekrar kullanılması çalınma sayılıp oturumu kapatır. Bu yüzden iki eşzamanlı refresh isteği, haksız yere kullanıcıyı çıkarır. Çözüm: aynı anda yalnızca bir istek uçuşta tutulur (React'in geliştirme modundaki çift çalışması dahil) ve sekmeler Web Locks API ile sıraya girer. 401 alan bir istek bir kez yenilenip tekrarlanır; yenilenemezse oturum bitmiş sayılır.

### 3. API'ye tek adres: Next.js proxy (rewrites)

Tarayıcı yalnızca web uygulamasıyla konuşur; `/api/*` isteklerini Next.js NestJS'e yönlendirir. CORS ayarı gerekmez ve API'nin çerezi sitenin kendi çerezi gibi davranır. Üretimde bir ters proxy aynı işi yapar. Google OAuth callback'i API'de kalır, API çerezi koyup web uygulamasına yönlendirir; access token hiçbir zaman URL'de dolaşmaz.

### 4. Tipli istemci: OpenAPI sözleşmesi repoda

API kendi OpenAPI belgesini `apps/api/openapi.json` olarak üretir; web `openapi-typescript` + `openapi-fetch` ile tipleri bundan üretir. İki dosya da repoda tutulur ve CI, "güncel mi" diye yeniden üretip `git diff` ile kontrol eder. Yanlış yol veya gövde derleme hatasıdır. Pratikte işe yaradı: `string | null` alanları sözleşmede nesne görünüyordu, tipli istemci bunu derleme sırasında yakaladı.

### 5. Sunucu ve istemci bileşenleri

Sayfalar (başlık, `params`) sunucu bileşenidir ve tarayıcıya JavaScript göndermez; form, tıklama ve tarayıcı durumu gereken kısımlar `'use client'` bileşenlerdir. Sunucu verisi TanStack Query ile alınır: önbellek, değişiklikten sonra ilgili anahtarların geçersiz kılınması, yeniden deneme ve yükleme durumları hazır gelir.

### 6. Arayüz bileşenleri

shadcn/ui (Base UI tabanlı). CLI'ın kendiliğinden eklediği `cn` paketini sahibini doğrulayamadığımız için almadık; aynı işi yapan 3 satırlık yardımcıyı `clsx` + `tailwind-merge` ile kendimiz tutuyoruz.

## Sonuçlar ve bilinen sınırlar

- Formlar `method="post"`: JavaScript yüklenmeden gönderilirse e-posta ve şifre adres çubuğuna düşmesin.
- E2E tarayıcı testi (Playwright) henüz yok; akışlar elle ve birim/bileşen testleriyle doğrulandı. Hafta 13'te eklenmesi planlanıyor.
- Görev ekranları (Hafta 8) için görev yanıtlarının sözleşmeye eklenmesi gerekiyor.
