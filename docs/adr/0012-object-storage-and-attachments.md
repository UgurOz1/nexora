# ADR-0012: Nesne depolama (SeaweedFS) ve dosya ekleri

- **Tarih:** 2026-11-04
- **Durum:** Kabul edildi

## Bağlam

Görevlere dosya eklenecek. Dosyalar veritabanında (büyür, yedeği zorlaşır) ya da API sunucusunun diskinde (birden çok sunucuda paylaşılmaz, ölçeklenmez) durmamalı: **S3 uyumlu nesne depolama** standart çözüm. Üretimde AWS S3 / Cloudflare R2 gibi bir hizmet kullanılabilir; yerelde S3 konuşan bir sunucu gerekir. Teknoloji yığını belgesi MinIO'yu varsayıyordu; **MinIO'nun Docker imajı artık yayınlanmıyor** (doğrulandı: `minio/minio` ve `quay.io/minio/minio` çekilemiyor).

## 1. Yerel sunucu seçimi

| Aday                    | Değerlendirme                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **SeaweedFS** (seçildi) | Olgun (10+ yıl), Apache-2.0, tek konteyner (`server -s3`), anahtarlar ortam değişkeniyle, bucket CORS ve imzalı URL destekli.      |
| RustFS                  | Yeni ve hızlı değişiyor; MinIO uyumlu olmayı hedefliyor. Hızla gelişen API'ye bağımlı olmak istemedik.                             |
| Garage                  | Hafif ve sağlam; ama kurulum için küme düzeni (layout) ve yapılandırma dosyası adımları var, geliştirme deneyimini ağırlaştırıyor. |
| LocalStack              | AWS'yi taklit eder; yalnızca S3 için fazla büyük.                                                                                  |

**Denendi, varsayılmadı:** Gerçek sunucuya karşı yazılan bir yoklama betiği şunları gösterdi: bucket oluşturma ve CORS çalışıyor; **AWS SDK'nın yeni sürümleri imzalı URL'ye gövdenin sağlama toplamını ekliyor ve bu SeaweedFS'te 400 veriyor** (`requestChecksumCalculation: 'WHEN_REQUIRED'` ile çözüldü); imza varsayılan olarak içerik türünü ve boyutu **zorlamıyor**, ama `content-type` ve `content-length` imzaya bağlanınca (`signableHeaders`) depolama sunucusu uyuşmayanı 403 ile reddediyor. Sürüm 4.50'ye sabitlendi (`latest` kullanılmaz). Üretimde sağlayıcı değişirse yalnızca ortam değişkenleri değişir (`S3_ENDPOINT`, anahtarlar, bucket).

## 2. Dosya API üzerinden geçmez

Üç adım:

1. **Duyur** (`POST /tasks/:id/attachments` ad, tür, boyut): sunucu ad/tür/boyutu doğrular, `PENDING` bir satır yazar, **imzalı bir PUT bağlantısı** döner (5 dk geçerli).
2. **Yükle:** tarayıcı dosyayı bağlantıya doğrudan depolamaya PUT eder.
3. **Tamamla** (`POST /attachments/:id/complete`): sunucu depolamaya bakar ve ancak ondan sonra `READY` yapar.

**Neden API'den geçirmiyoruz?** Büyük bir dosyayı API'den geçirmek bellek, bant genişliği ve bir istek işçisi tutmak demek; birkaç yükleme API'yi yavaşlatabilir. Doğrudan yüklemede API yalnızca küçük JSON konuşur, bant genişliğini depolama taşır. Bedeli: dosya içeriğini API görmez, bu yüzden 3. adımda kontrol şart.

## 3. Yüklenen dosyaya güvenilmez

Tarayıcının bildirdiği tür ve dosya uzantısı yükleyen kişinin seçtiğidir; hiçbir şey kanıtlamaz. Katmanlar:

- **İzin listesi:** yalnızca resim (PNG, JPEG, GIF, WebP), PDF, metin/CSV/JSON, ZIP, DOCX, XLSX. **HTML, SVG, betik ve XML yok**: tarayıcının sayfa olarak çizebileceği ya da çalıştırabileceği hiçbir şey duyurulamaz.
- **Depolama sınırı zorlar:** tür ve tam boyut imzaya bağlı; farklısı 403.
- **Tamamlarken doğrulama:** boyut duyurulanla aynı mı (değilse dosya ve satır silinir), ilk baytlar türle uyuşuyor mu (PNG imzası, `%PDF-`, `PK..` …; metin türlerinde NUL baytı yok). HTML'i `cute.png` diye yükleyen biri 400 alır ve dosyası silinir.
- **İndirme `attachment` olarak:** `Content-Disposition: attachment` ve **bizim doğruladığımız** tür (`ResponseContentType`) ile; dosya hiçbir koşulda depolama adresinde sayfa olarak çizilmez. Başlık enjeksiyonuna karşı dosya adı çıkış karakterlerinden arındırılır (satır sonu/tırnak testli).
- **Yol sunucuda üretilir:** `orgs/<şirket>/tasks/<görev>/<rastgele uuid>`; kullanıcının yazdığı ad yalnızca görüntüde (temizlenmiş: yol ayracı, kontrol karakteri, baştaki nokta yok).
- **Sınırlar:** dosya başına 10 MiB, görev başına 25 dosya, yük duyurusu hız sınırlı (ADR-0010).

## 4. Yetki ve izolasyon

Her üye görevi görebildiği sürece dosyayı görür, ekler, indirir. **Silmeyi** ekleyen ya da MANAGER ve üstü yapar. **Tamamlamayı yalnızca yükleyen** yapar. İndirme bağlantısı 1 dakika yaşar ve yalnızca `READY` dosya için üretilir. Başka şirketin dosya kimliği 404 verir (testli). Şirket silinince dosyaları da depolamadan silinir (önek silme); depolama o an erişilemezse silme başarılı sayılır ve artık hata loglanır.

## 5. Yarım kalan yüklemeler

Duyurulup tamamlanmayan yükleme (kapatılan sekme) bir satır ve belki bir dosya bırakır. BullMQ zamanlayıcısı (ADR-0009) 15 dakikada bir 1 saatten eski `PENDING` kayıtları ve dosyalarını siler. Silme **koşulludur** (hâlâ `PENDING` ise); tam o an tamamlanan bir yükleme silinmez.

## Bilinen sınırlar

- Tamamlanmadan önce depolamada duran dosya (en çok 1 saat) var; boyutu duyurulanla sınırlıdır (imza) ama kota denetimi yok.
- Virüs taraması yok; içerik yalnızca biçim olarak doğrulanır (ve indirme `attachment` olduğu için tarayıcıda çalışmaz).
- Silinen görevin ekleri depolamada kalır (görev "soft delete"; kayıtlar geri getirilebilir olsun diye).
- İmzalı bağlantı, sahibinden başkasına verilirse çalışır (bearer); bu yüzden kısa ömürlüdür.
