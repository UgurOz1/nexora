# Veri modeli (ERD)

Kaynak: [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma). Şema değişirse bu diyagram da güncellenir.

```mermaid
erDiagram
    users ||--o{ memberships : "üyesi"
    organizations ||--o{ memberships : "üyeleri"
    organizations ||--o{ invitations : "davetleri"
    users ||--o{ invitations : "davet eden"
    organizations ||--o{ projects : "projeleri"
    organizations ||--o{ tasks : "görevleri"
    projects ||--o{ tasks : "görevleri"
    tasks ||--o{ tasks : "alt görevleri"
    users ||--o{ tasks : "atanan"
    users ||--o{ tasks : "oluşturan"
    tasks ||--o{ task_dependencies : "bekleyen (taskId)"
    tasks ||--o{ task_dependencies : "beklenen (dependsOnId)"
    tasks ||--o{ task_events : "geçmişi"
    users ||--o{ task_events : "yapan"
    projects ||--o{ recurring_tasks : "şablonları"
    recurring_tasks ||--o{ tasks : "ürettiği"

    users {
        uuid id PK
        string email UK
        string passwordHash "Google girişinde null"
        string name
        datetime emailVerifiedAt
    }
    organizations {
        uuid id PK
        string name
        string slug UK
    }
    memberships {
        uuid id PK
        uuid userId FK
        uuid organizationId FK
        enum role "OWNER | ADMIN | MANAGER | MEMBER"
    }
    invitations {
        uuid id PK
        uuid organizationId FK
        string email
        enum role
        string tokenHash UK
        uuid invitedById FK
        datetime expiresAt
        datetime acceptedAt
    }
    projects {
        uuid id PK
        uuid organizationId FK
        string name
        string description
        string department "ekip / departman"
        datetime deletedAt "soft delete"
    }
    tasks {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        uuid parentId FK "alt görev ise"
        string title
        enum status "TODO | IN_PROGRESS | IN_REVIEW | DONE"
        enum priority "LOW | MEDIUM | HIGH | URGENT"
        datetime dueDate
        string_array labels "küçük harfli, tekil, en fazla 10"
        uuid assigneeId FK
        uuid createdById FK
        string position "Kanban sırası"
        uuid recurringTaskId FK "şablondan üretildiyse"
        datetime occurrenceAt "UK (recurringTaskId, occurrenceAt)"
        datetime deletedAt "soft delete"
    }
    task_dependencies {
        uuid id PK
        uuid organizationId FK
        uuid taskId FK "bekleyen görev"
        uuid dependsOnId FK "bitmesi beklenen görev"
    }
    task_events {
        uuid id PK
        uuid organizationId FK
        uuid taskId FK
        uuid actorId FK "sistem ise null"
        enum type "CREATED | UPDATED | DELETED | DEPENDENCY_ADDED | DEPENDENCY_REMOVED"
        json changes "alan: {from, to}"
        json snapshot "olay sonrası görevin hali"
        datetime createdAt
    }
    recurring_tasks {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        string title
        string rrule "RFC 5545, UTC"
        datetime startsAt
        int dueInDays
        boolean active
        datetime nextRunAt "henüz görev üretmemiş sıradaki oluşum"
        datetime lastRunAt
    }
```

## Tasarım kararları

- **Çok kiracılık:** Tenant'a ait her tabloda `organizationId` var. `tasks` tablosunda da (projeden türetilebilse bile) tutuluyor, böylece her sorgu doğrudan tenant ile filtrelenebiliyor ve indekslenebiliyor.
- **Membership ayrı tablo:** Bir kullanıcı birden fazla organizasyonda, her birinde farklı rolle olabilir (çoka çok ilişki + rol).
- **Davet token'ı hash'li:** Veritabanı sızsa bile davet linkleri kullanılamaz.
- **Soft delete:** Projeler ve görevler silinince `deletedAt` dolar; geri alma ve denetim kaydı mümkün olur. Proje silinince görevleri aynı işlemde silinmiş olarak işaretlenir; görev silinince alt görevleri de. Her okuma sorgusu `deletedAt: null` filtresi uygular.
- **Alt görev:** Aynı tabloda `parentId` ile; yalnızca bir seviye (alt görevin alt görevi yok) ve üstüyle aynı projede.
- **Bağımlılık:** `task_dependencies` bir yönlü graf kenarıdır ("taskId, dependsOnId bitmeden başlayamaz"). Döngüsüzlük veritabanı kısıtıyla ifade edilemez; serviste DFS ile ve şirket başına kilit altında denetlenir (ADR-0005).
- **Geçmiş:** `task_events` ekleme-yalnızca (append-only) tablodur. `changes` o olayın değiştirdiğini, `snapshot` olaydan sonraki hali tutar; iki sürümün farkı iki snapshot'tan hesaplanır. Görev soft delete olsa da olaylar kalır (denetim izi).
- **Tekrarlayan görev:** `recurring_tasks` şablondur. Aynı oluşumun iki görev üretmemesi `(recurringTaskId, occurrenceAt)` unique kısıtıyla veritabanı düzeyinde garanti edilir. Şablon silinince üretilmiş görevler kalır, `recurringTaskId` `NULL` olur.
- **UUID kimlikler:** Sıralı sayılar URL'de tahmin edilebilir (`/tasks/1`, `/tasks/2`) ve kayıt sayısını açığa çıkarır.
- **İndeksler:** Kanban ekranının ana sorgusu (`organizationId + projectId + status`) ve şirket genelindeki liste/sayfalama (`organizationId + createdAt`) için birleşik indeksler.
