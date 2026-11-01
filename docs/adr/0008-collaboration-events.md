# ADR-0008: Yorumlar, bildirimler, aktivite akışı ve domain event'leri

- **Tarih:** 2026-11-01
- **Durum:** Kabul edildi

## Bağlam

Hafta 9'da görevlere yorum, `@mention`, bildirim ve proje/organizasyon aktivite akışı ekliyoruz. Asıl tasarım sorusu: "Bir görev atandığında bildirim üretmek" görevi yöneten servisin işi mi?

## Kararlar

### Domain event'leri (`@nestjs/event-emitter`)

Servisler "şu oldu" der (`task.created`, `task.status_changed`, `task.assigned`, `comment.created`, `comment.updated`); tepki verenleri bilmez. Bildirim bugün tek dinleyici; Hafta 10'da canlı güncelleme (Socket.IO) ve e-posta kuyruğu (BullMQ) yeni dinleyici olarak eklenecek, `TasksService`'e dokunmadan. Servisleri birbirine doğrudan bağlasaydık her yeni tepki, olayı üreten servisi değiştirmek demek olurdu ve bağımlılıklar döngüye girerdi.

- Olaylar **commit'ten sonra** yayınlanır; geri alınan bir işlem asla olay üretmez.
- `DomainEvents.publish` dinleyicileri bekler (testler ve çağıran etkisini görebilsin) ama dinleyici hatasını **yutup loglar**: değişiklik zaten kalıcı, bildirim hatası isteği bozmamalı.
- **Bilinen risk:** Süreç commit ile olay arasında çökerse bildirim kaybolur (olay bellekte yaşar). Kalıcı çözüm "transactional outbox" ya da kuyruk; Hafta 10'da BullMQ ile bildirim kuyruğu gelince kapanacak. Şimdilik bildirimler en-iyi-çaba.
- Paket sürümü: `@nestjs/event-emitter` 3.x (12 yalnızca ESM, projemiz CommonJS; ADR-0003).

### Mention biçimi: metnin içinde `@[Ad](kullanıcıId)`

Mention'ları ayrı tabloda tutmuyoruz; yorum kaydedilirken metinden ayrıştırılır. Kimlik esas alındığı için kişi adını değiştirse de doğru kişiyi gösterir. Yalnızca **aynı şirketin üyeleri** bildirim alır; başka şirketteki ya da uydurma kimlik düz metin sayılır ve hata vermez (kişinin var olup olmadığı sızmaz). Yazar kendini anarsa bildirim gitmez. Yorum düzenlenince yalnızca **yeni** anılanlar bildirim alır.

### Bildirimler kişiye özel

`notifications` tablosunda alıcı `userId`'dir; her sorgu hem şirkete (`forTenant`) hem alıcıya göre süzülür. Başkasının bildirimi "bulunamadı"dır (404). Silinen görevin bildirimleri gizlenir. İki tür var: `MENTION`, `ASSIGNED` (kendine atama bildirim üretmez).

### Aktivite akışı = görev geçmişinin proje/şirket genelindeki hali

Ayrı bir tablo yok: tek bir görevin geçmişini besleyen `task_events` kayıtları proje ya da şirket genelinde, yeni → eski okunur. "Yorum eklendi" bu yüzden yeni bir olay türü (`COMMENT_ADDED`) ve yorumla aynı işlemde yazılır. Bu bir **audit log değildir**: audit log güvenlikle ilgili her eylemi (giriş, rol değişikliği, silme…) kaydeder ve Hafta 11'de ayrı gelir. Akış "ekip ne yapıyor?", audit log "kim neyi ne zaman yaptı, kanıtla?" sorusunu yanıtlar.

### Yorum yetkileri

Her üye okur ve yazar. **Yalnızca yazarı düzenler** (kimse başkası adına konuşmaz; MANAGER bile). Silmeyi yazar ya da MANAGER ve üstü yapar (moderasyon). Silme soft delete'tir.

## Alternatifler

- _Bildirimi servis içinde doğrudan yazmak:_ Basit ama her yeni tepki servisi değiştirir.
- _Bildirimleri aynı işlemde yazmak:_ Atomik olurdu; ancak olay altyapısının asıl amacı (sonradan tepki eklemek) kaybolurdu. Dayanıklılık Hafta 10'da kuyrukla gelecek.
- _Mention'ları ayrı tabloya yazmak:_ Sorgu kolaylığı sağlar; düzenlemede iki kaynağı senkron tutmak gerekir. Şimdilik gereksiz.
- _Aktivite için ayrı tablo:_ Aynı bilginin ikinci kopyası; tutarsızlık riski.
