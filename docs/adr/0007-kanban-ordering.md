# ADR-0007: Kanban panosu ve görev sıralaması

- **Tarih:** 2026-11-01
- **Durum:** Kabul edildi

## Bağlam

Hafta 8'de görevler sütunlara (durumlara) bölünmüş bir panoda gösterilecek ve sürükle-bırak ile hem sütun içinde yeniden sıralanacak hem de sütunlar arasında taşınacak. Sıra kalıcı olmalı, aynı anda birden çok kişi taşıma yapınca bozulmamalı.

## Karar

### Sıra: fractional indexing (kendi uygulamamız)

Her görevin `position` alanı bir **metin anahtarıdır**; sütun içinde `ORDER BY position, id` ile sıralanır. İki kartın arasına koymak için komşuların arasında kalan yeni bir anahtar üretilir (`keyBetween(a, b)`); diğer kartlara dokunulmaz. 1, 2, 3 gibi tam sayılarla tutsaydık, araya koymak için altındaki tüm kartları kaydırmak (N satır güncelleme) gerekirdi ve iki kişi aynı anda taşırsa çakışırdı.

- Anahtarlar yalnızca `0-9a-z` karakterlerinden oluşur ve `0` ile bitemez. Böylece Postgres'in karşılaştırma kuralı (collation) ile düz karakter karşılaştırması aynı sonucu verir; bir e2e testi 300 anahtarla bunu doğrular.
- Sona ekleme anahtarı kısa tutar (`i`, `j`, `k`…). Aynı yere defalarca bırakmak anahtarı uzatır; `MAX_KEY_LENGTH` (32) aşılırsa sütun yeniden numaralandırılır (`rebalanceColumn`).
- `fractional-indexing` paketini kullanmadık: 4.0 sürümü yalnızca ESM, projemiz CommonJS (ADR-0003). Algoritma küçük, 5000 rastgele ekleme dahil 18 birim testle kanıtlandı.

### Sunucu konumu hesaplar, istemci sadece "nereye" der

`POST /tasks/:id/move` gövdesi `{ status, afterId }`'dir (`afterId: null` = en üst). Anahtarı **sunucu** o anki veritabanı durumuna bakarak üretir. İstemci anahtar üretseydi, eski bir pano görüntüsüyle aynı anahtarı iki karta verebilir ya da geçersiz anahtar gönderebilirdi. `afterId` aynı projede, hedef sütunda ve taşınan görev dışında bir görev olmalıdır; değilse 400.

### Eşzamanlılık

Taşıma, görev satırını `SELECT … FOR UPDATE` ile kilitleyen işlemde yapılır (ADR-0005'teki düzenleme deseniyle aynı). İki kart aynı aralığa aynı anda bırakılırsa aynı anahtarı alabilirler; bu durumda `(position, id)` sıralaması kararlı bir sıra verir ve bir sonraki taşıma geçersiz/yinelenen anahtarı görünce sütunu yeniden numaralandırıp bir kez daha dener.

### Bağımlılık kapısı sürüklemede de geçerli

Engellenmiş (açık bağımlılığı olan) bir görev TODO dışındaki bir sütuna bırakılırsa 409 döner (ADR-0005). TODO içinde sıralanabilir. Sürükleme ayrı bir "yan kapı" olmasın diye durum değişimi de aynı kontrolden geçer.

### Pano uç noktası

`GET /projects/:id/board` her durum için bir sütun döner (sütun başına en fazla 100 kart + `hasMore`); yalnızca üst düzey görevler, alt görevler panoda görünmez. Yeni görev ve formdan durumu değişen görev, yeni sütunun **sonuna** gider.

### Yetki

Görevleri taşımak, görev düzenlemekle aynı yetkidedir: her üye (MEMBER dahil). Tenant izolasyonu `forTenant` uzantısı ve `OrganizationGuard` ile sağlanır; başka şirketin kartı komşu olarak da gösterilemez.

## Alternatifler

- _Tam sayı sıra + kaydırma:_ N satır güncelleme, çakışmaya açık.
- _Kayan nokta (float) sıra:_ Birkaç bölmeden sonra hassasiyet biter.
- _LexoRank (Jira) tarzı kova sistemi:_ Daha karmaşık; bizim ölçeğimizde gereksiz.

## Sonuçlar

- Taşıma tek satır güncellemesidir; geçmişe yalnızca durum değişimi yazılır (salt sıralama geçmişi şişirmez).
- Bozuk/eski anahtarlar kendiliğinden onarılır.
