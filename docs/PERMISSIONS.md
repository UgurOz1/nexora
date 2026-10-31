# Roller ve yetkiler

Kurallar kodda [policies.ts](../apps/api/src/organizations/policies.ts) ve [roles.ts](../apps/api/src/organizations/roles.ts) içinde; bu belge onların okunabilir özeti. Rol değişirse ikisi birlikte güncellenir.

Roller bir merdiven oluşturur: **OWNER > ADMIN > MANAGER > MEMBER**. Bir şirkette kullanıcının tek bir rolü vardır; farklı şirketlerde farklı rolleri olabilir.

## Ne yapabilir?

| İşlem                                      | OWNER | ADMIN | MANAGER | MEMBER |
| ------------------------------------------ | :---: | :---: | :-----: | :----: |
| Şirket bilgisini ve üyeleri görmek         |   ✓   |   ✓   |    ✓    |   ✓    |
| Şirket adını değiştirmek                   |   ✓   |   ✓   |         |        |
| Şirketi silmek                             |   ✓   |       |         |        |
| Davet göndermek, bekleyen davetleri görmek |   ✓   |   ✓   |         |        |
| Daveti iptal etmek                         |   ✓   |   ✓   |         |        |
| Üyenin rolünü değiştirmek                  |   ✓   |   ✓   |         |        |
| Üyeyi çıkarmak                             |   ✓   |   ✓   |         |        |
| Kendi isteğiyle şirketten ayrılmak         |       |   ✓   |    ✓    |   ✓    |

### Projeler ve görevler

| İşlem                                             | OWNER | ADMIN | MANAGER | MEMBER |
| ------------------------------------------------- | :---: | :---: | :-----: | :----: |
| Projeleri ve görevleri görmek                     |   ✓   |   ✓   |    ✓    |   ✓    |
| Proje oluşturmak, düzenlemek                      |   ✓   |   ✓   |    ✓    |        |
| Projeyi silmek (görevleri de gizlenir)            |   ✓   |   ✓   |         |        |
| Görev ve alt görev oluşturmak, düzenlemek, atamak |   ✓   |   ✓   |    ✓    |   ✓    |
| Başkasının görevini silmek                        |   ✓   |   ✓   |    ✓    |        |
| Kendi oluşturduğu görevi silmek                   |   ✓   |   ✓   |    ✓    |   ✓    |

### Bağımlılıklar, geçmiş ve tekrarlayan görevler

| İşlem                                                    | OWNER | ADMIN | MANAGER | MEMBER |
| -------------------------------------------------------- | :---: | :---: | :-----: | :----: |
| Görev bağımlılığı eklemek, kaldırmak                     |   ✓   |   ✓   |    ✓    |   ✓    |
| Görev geçmişini görmek, iki sürümü karşılaştırmak        |   ✓   |   ✓   |    ✓    |   ✓    |
| Tekrarlayan görev şablonlarını görmek                    |   ✓   |   ✓   |    ✓    |   ✓    |
| Tekrarlayan görev şablonu oluşturmak, düzenlemek, silmek |   ✓   |   ✓   |    ✓    |        |

Şablon sürekli yeni iş ürettiği için yönetimi MANAGER ve üstüne ait. Bağımlılığı olan ve bitmemiş bir görev, bekledikleri DONE olana kadar `TODO`'dan ilerletilemez (409).

Bir göreve yalnızca aynı şirketin üyesi atanabilir. Silme "soft delete"tir: kayıtlar veritabanında kalır, API'den kaybolur.

## "Kimin üzerinde" kuralları

Rol yeterli olsa bile, kendi seviyen veya üstündekilere işlem yapamazsın:

- **Davet:** Sadece kendi rolünün **altındaki** rollere. ADMIN → MANAGER veya MEMBER davet eder; OWNER → ADMIN, MANAGER, MEMBER davet eder. **OWNER rolü hiç verilmez.**
- **Rol değiştirme:** Hem üyenin mevcut rolü hem de yeni rol, senin rolünün **altında** olmalı. Kimse kendi rolünü değiştiremez. ADMIN, bir ADMIN'i değiştiremez veya birini ADMIN yapamaz.
- **Üye çıkarma:** Çıkarılan kişinin rolü senin rolünün altında olmalı. OWNER çıkarılamaz.
- **Ayrılma:** OWNER ayrılamaz (şirketi silmesi gerekir). Diğerleri kendilerini çıkarabilir.

## Üye olmayanlar

Şirketin üyesi olmayan biri o şirketin **hiçbir** adresine erişemez; cevap her zaman **404**'tür ve gerçek bir şirketle uydurma bir kimlik arasında fark yoktur. Böylece bir şirketin var olduğu bile sızmaz. Ayrıntı: [ADR-0004](adr/0004-multi-tenancy-shared-schema.md).

## Davet kuralları

- Davet bir **e-posta adresine** verilir. Kabul eden kişinin hesabı o adresle açılmış **ve doğrulanmış** olmalı; iletilmiş bir link başkası için çalışmaz.
- Link tek kullanımlık ve 7 gün geçerli; veritabanında yalnızca hash'i durur.
- Aynı adrese yeni davet gönderilirse eskisinin linki geçersiz olur.
- Zaten üye olana davet gönderilemez.
