# ADR-0005: Görev bağımlılıkları, geçmiş ve tekrarlayan görevler

- **Tarih:** 2026-10-31
- **Durum:** Kabul edildi

## Bağlam

Hafta 6'da üç özellik ekledik: görevler arası bağımlılık, her görevin değişiklik geçmişi ve tekrarlayan görevler. Üçünde de "iki istek aynı anda gelirse ne olur?" sorusu asıl zor kısım.

## 1. Bağımlılıklar ve döngü tespiti

**Model:** `task_dependencies(taskId, dependsOnId)` yönlü bir graftır; "taskId, dependsOnId DONE olana kadar TODO'dan ilerleyemez". Silinmiş (soft delete) görevlerin kenarları yok sayılır.

**Döngü tespiti:** `taskId → dependsOnId` kenarı eklemek, `dependsOnId` zaten (doğrudan ya da dolaylı) `taskId`'yi bekliyorsa döngü oluşturur. Bunu `dependsOnId`'den başlayan DFS ile arıyoruz: her düğüm en fazla bir kez ziyaret edilir, **O(V + E)**. Yinelemeli (iterative) yazıldı: 50.000 görevlik zincir bile yığını taşırmaz (test edildi). Hata mesajı döngüdeki görevleri sırayla listeler ("A -> B -> C -> A").

**Eşzamanlılık:** Döngüsüzlük bir unique kısıtla ifade edilemez; kontrol uygulamada yapılır. Ama iki istek aynı anda "A, B'yi beklesin" ve "B, A'yı beklesin" derse her biri diğerinin kenarını görmeden kontrolü geçer ve birlikte döngü oluşturur. Bunu **şirket başına advisory lock** (`pg_advisory_xact_lock(hashtext(organizationId))`) ile engelliyoruz: bir şirkette bağımlılık yazan işlemler sıraya girer, kilit işlem bitince kendiliğinden kalkar. Kilit kaldırıldığında eşzamanlılık testi başarısız oluyor (mutasyon testi ile doğrulandı).

**Alternatifler:**

- _Serializable izolasyon seviyesi:_ Aynı sorunu çözer, ama çakışan işlemler hata verip yeniden denenmeli; kilit daha basit ve deterministik.
- _Veritabanında özyinelemeli CTE ile kontrol:_ Veri büyükse daha verimli olabilir (tüm kenarları yüklemek yerine sadece ilgili alt grafı gezer). Şimdilik şirketin tüm kenarlarını yüklüyoruz; binlerce kenarda sorun değil. Ölçeklenirse bu yola geçilir.

**Durum kapısı:** Açık (bitmemiş) bağımlılığı olan görev `TODO` dışına geçirilemez, 409 döner ve engelleyen görevleri adlarıyla söyler. `TODO`'ya dönmek her zaman serbest. Bağımlılık eklerken görev zaten ilerlemişse engellemiyoruz (yapılan iş geri alınamaz), sadece sonraki geçişleri kapatıyoruz.

## 2. Görev geçmişi

**Model:** `task_events` ekleme-yalnızca tablodur. Her olay iki şey taşır: `changes` (bu olayın değiştirdiği alanlar, `{alan: {from, to}}`) ve `snapshot` (olaydan sonra görevin izlenen alanları). İki sürümü karşılaştırmak, iki olayın snapshot'larının farkıdır; aradaki olayları sırayla oynatmak gerekmez.

**Alternatifler:**

- _Sadece fark (diff) saklamak:_ Küçük, ama rastgele iki sürümü karşılaştırmak tüm olayları yeniden oynatmayı gerektirir.
- _Sadece snapshot saklamak:_ Her olayın neyi değiştirdiği her seferinde hesaplanır; listeleme yavaşlar.
- _Veritabanı tetikleyicileri (trigger) ile denetim:_ Uygulamadan bağımsız çalışır ama "kim yaptı" bilgisi (uygulama kullanıcısı) kaybolur ve test etmesi zordur.
- Seçim: ikisini birden saklamak. Bedeli biraz daha depolama.

**Tutarlılık:** Değişiklik ve geçmiş kaydı **aynı veritabanı işleminde** yazılır; biri olmadan diğeri olmaz. İki kişi aynı görevi aynı anda düzenlerse, güncelleme işlemi görev satırını `SELECT ... FOR UPDATE` ile kilitler: ikinci istek birincinin sonucunu okuyup ondan sonra yazar. Böylece her olay tek bir değişikliği anlatır ve olaylar zincirleme tutarlıdır (A→X, sonra X→Y). Kilit olmadan iki olay da "A'dan" başlıyormuş gibi kaydedilir (mutasyon testi ile doğrulandı). Değişiklik yapılmayan veya sadece etiket sırası değişen güncellemeler olay üretmez.

**Not:** Alan bazında birleşme (A başlığı, B önceliği değiştirir) otomatik çalışır. Aynı alanı aynı anda değiştirirlerse "son yazan kazanır". İleride arayüzde kullanıcıya uyarı vermek gerekirse iyimser kilitleme (sürüm numarası / `If-Match`) eklenebilir.

**Sınır:** Proje silinince görevlerin soft delete'i için tek tek olay yazılmıyor; kuruluş geneli denetim kaydı Hafta 11'de gelecek.

## 3. Tekrarlayan görevler

- **Biçim:** RFC 5545 RRULE (takvim uygulamalarının kullandığı standart), `rrule` kütüphanesiyle ayrıştırılır. Cron yerine bunu seçtik: "her ayın ilk pazartesisi" gibi kuralları cron ifade edemez. Tüm zamanlar UTC. Sıklık en az günlük (saatlik/dakikalık kurallar reddedilir: yanlış yazılmış bir kural binlerce görev üretmesin).
- **Üretim mantığı:** `generateDue(now)` zamanı parametre olarak alır (testlerde zaman ilerletilir). Hafta 10'da kuyruğa bağlanacak.
- **Çift üretimi engelleme (iki bağımsız katman):** (1) Şablonun `nextRunAt` değerini atomik olarak ilerleten koşullu güncelleme: aynı oluşumu iki işçi alırsa biri `count = 0` görür ve durur. (2) Görevde `(recurringTaskId, occurrenceAt)` unique kısıtı: birinci katman bozulsa bile veritabanı kopyayı reddeder. Her ikisi de bozulunca testler başarısız oluyor; sadece biri bozulunca diğeri koruyor.
- **Kaçırılan oluşumlar (misfire):** İş uzun süre çalışmadıysa **yalnızca bir** görev üretilir ve program `now`'dan sonraki ilk oluşumdan devam eder. Otuz bayat görevi birden yaratmak insanları boğar. Yeniden etkinleştirilen şablon da kaçırdıklarını atlar.
- **Yan durumlar:** Silinmiş projenin şablonu atlanır; şirketten ayrılmış atanan kişi boşaltılır; kural bitince (`COUNT`) `nextRunAt` null olur; şablon silinince üretilmiş görevler kalır (`recurringTaskId` NULL).
- **Çok kiracılık:** `generateDue`, şablonları şirketler arası okuyan tek yerdir (sistem işi herkese hizmet eder, bilerek). Her şablon sonra kendi şirketine kapsamlı `forTenant` istemcisiyle işlenir.

## Sonuçlar

- Bu üç özellik, eşzamanlılık ve veri bütünlüğü konularında somut örnek sunar: advisory lock, satır kilidi, koşullu güncelleme ile "talep etme", unique kısıt ile idempotency.
- Her kilit/koruma, kaldırıldığında başarısız olan bir testle desteklenir.
