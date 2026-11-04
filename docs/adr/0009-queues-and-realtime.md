# ADR-0009: Arka plan işleri (BullMQ) ve gerçek zamanlı güncelleme (Socket.IO)

- **Tarih:** 2026-11-04
- **Durum:** Kabul edildi

## Bağlam

Üç ihtiyaç vardı: e-postayı HTTP isteğinin içinde göndermemek, bildirimlerin bir veritabanı hıçkırığında kaybolmaması, ve açık tarayıcıların başkasının değişikliğini yenilemeden görmesi. Ayrıca Hafta 6'dan kalan "tekrarlayan görevleri zamanında üret" işi bir zamanlayıcıya bağlanacaktı. Teknoloji yığını zaten BullMQ ve Socket.IO'yu (Redis adapter ile) söylüyordu; bu ADR kullanım biçimini kaydeder.

## 1. Kuyruklar (BullMQ)

Dört kuyruk: `mail`, `notifications`, `recurring`, `dead-letter`. Üretici (istek, olay dinleyicisi) iş ekleyip döner; işçi (worker) işi alır. Şimdilik işçiler API sürecinin içinde çalışır; aynı kod ayrı bir süreçte de çalıştırılabilir (Redis ortak).

- **Yeniden deneme:** Her iş en fazla 5 kez denenir, aralık üstel artar (1 s, 2 s, 4 s, 8 s). Kısa bir SMTP ya da veritabanı kesintisi kimsenin fark etmeyeceği şekilde emilir.
- **Ölü mektup (dead-letter):** Tüm denemeleri tüketen iş `dead-letter` kuyruğuna kopyalanır (kuyruk adı, iş adı, veri, neden). Kaybolmaz, bir insan bakabilir. Bu kuyruğun işçisi yoktur (bilerek).
- **E-posta:** `MailService.send` artık yalnızca kuyruğa ekler; SMTP'ye `MailProcessor` → `MailTransport` konuşur. İstek SMTP'yi beklemez, SMTP kesintisi isteği düşürmez. Not: iş verisi (doğrulama bağlantısı) Redis'te durur; başarılı işler 1 saat, başarısızlar 7 gün tutulur. Bağlantılar zaten tek kullanımlık ve kısa ömürlü.
- **Bildirimler:** Olay dinleyicisi (ADR-0008) artık satırı kendisi yazmaz, `notifications` kuyruğuna iş ekler; `NotificationsProcessor` tek bir `INSERT` ile yazar ve alıcıya canlı haber verir. ADR-0008'de yazılan "olay bellekte yaşar, süreç çökerse bildirim kaybolur" riski **kapanır**: iş Redis'e yazıldıktan sonra kalıcıdır. **Kalan boşluk:** veritabanı işlemi commit olduktan ile Redis'e `add` arasındaki çok kısa an. Tam çözüm "transactional outbox" (olayı aynı işlemde bir tabloya yazmak); bu ölçekte gereksiz bulundu.
- **Teslim garantisi: en az bir kez.** İşçi `INSERT`'ten sonra, kuyruğa haber vermeden ölürse iş tekrar çalışır ve aynı bildirim iki kez yazılabilir. Bildirim için kabul edilebilir; para gibi şeylerde idempotency anahtarı gerekirdi.

## 2. Zamanlanmış iş: tekrarlayan görevler

BullMQ'nun _job scheduler_'ı (`upsertJobScheduler`) dakikada bir `generate-due` işi üretir. Zamanlama Redis'te saklanır; on API sunucusu başlasa da dakikada **bir** iş üretilir (her sunucu aynı zamanlayıcıyı "upsert" eder). İş `RecurringTasksService.generateDue()`'yu çağırır. İki işçi yine de aynı anda çalışırsa Hafta 6'daki "talep etme" (koşullu güncelleme + benzersiz anahtar) her tekrarın tek göreve dönüşmesini garantiler (ADR-0005). Misfire politikası değişmedi (kaçırılan tekrarlardan yalnızca biri üretilir). `QUEUE_SCHEDULER_ENABLED=false` zamanlayıcıyı kapatır (testlerde kullanılır).

_Alternatif:_ `@nestjs/schedule` (cron). Her sunucuda ayrı çalışır; çoklu sunucuda aynı işi birden çok kez tetikler ve kilit için ek mekanizma ister. Reddedildi.

## 3. WebSocket (Socket.IO)

**Kimlik, bağlanırken bir kez:** Tarayıcı `auth: { token }` ile erişim token'ını gönderir; sunucu bağlantı kurulmadan önce bir ara katmanda (middleware) doğrular (aynı gizli anahtar, HS256 sabit). Geçersiz token'lı istek hiç soket olmaz (`unauthorized`).

**Yetki, odaya girerken:** Bağlanmak hiçbir şey vermez; soket yalnızca kendi `user:<id>` odasındadır. `subscribe { organizationId, projectId? }` mesajında üyelik ve projenin o şirkete ait olması veritabanından kontrol edilir; "yok" ve "senin değil" aynı cevabı alır (`Not found`), HTTP API ile aynı kural. Soket başına en fazla 20 oda.

**Token süresi:** Erişim token'ı 15 dakika yaşar; açık soket bundan uzun yaşamasın diye sunucu token bitince `token_expired` gönderip soketi kapatır, tarayıcı yeni token alıp yeniden bağlanır. İptal edilen oturum en geç bir token ömrü içinde dışarıda kalır. **Bilinen sınır:** üyelikten çıkarılan kişi, yeniden bağlanana (en çok 15 dk) kadar eski odalarda dinlemeyi sürdürebilir.

**Olaylar içerik taşımaz.** `tasks.changed { taskId, actorId, kind }` ve `notifications.changed { organizationId }` yalnızca "tekrar bak" der; veri normal, yetkisi denetlenen REST API'den çekilir. Böylece WebSocket yeni bir yetki yüzeyi açmaz ve sızdırabileceği içerik yoktur.

**Ölçekleme:** `@socket.io/redis-adapter` her `emit`'i Redis pub/sub ile yayınlar; A sunucusunda üretilen olay B sunucusuna bağlı tarayıcıya ulaşır (e2e testte iki gerçek uygulama örneğiyle kanıtlandı). Yük dengeleyicide sabit oturum (sticky session) yalnızca HTTP long-polling'e düşülürse gerekir; istemci doğrudan `websocket` aktarımını kullanır.

**CORS:** Yalnızca `APP_URL`'in kökeni (geliştirmede `localhost` ↔ `127.0.0.1` eşi de).

## Alternatifler

- _Ham WebSocket (`ws`):_ Oda, yeniden bağlanma ve çok sunuculu yayın elle yazılırdı.
- _Server-Sent Events:_ Tek yönlü, daha basit; ancak oda/abonelik mantığını ve Redis'le yayını yine biz yazardık, ve istemciden sunucuya mesaj (subscribe) için ayrı HTTP gerekirdi.
- _Olayla birlikte veri göndermek:_ Tek istek kazandırır ama her olayda yetki kontrolü gerektirir ve sızıntı yüzeyi açar.
- _Bildirim kuyruğu yerine doğrudan yazmak (ADR-0008):_ Basit ama yeniden deneme ve kalıcılık yok.

## Sonuçlar

- Yeni bir arka plan işi eklemek: kuyruk adı + bir `Processor` sınıfı.
- Testler gerçek Redis kullanır; her koşu benzersiz `QUEUE_PREFIX` ile kendi anahtarlarında çalışır, `QueuesService.whenIdle()` ile bekler (uyku yok).
- Üretimde işçiler ayrı sürece alınabilir; şimdilik gerek yok.
