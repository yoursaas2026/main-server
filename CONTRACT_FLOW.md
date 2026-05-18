# Marketplace contract flow

End-to-end lifecycle for escrow-style contracts between a **client** and **developer** on a live listing. Money math: **2.36%** non-refundable fee on gross; escrow split on completion via `CONTRACT_PLATFORM_COMMISSION_PERCENT` (default **20%** platform / **80%** developer of escrow).

**Code:** `src/services/contract.service.ts`, `src/services/contract-settlement.service.ts`, `src/jobs/contract-jobs.ts`

**Portals:** Client (`yoursaas`), Developer (`developer.yoursaas`), Admin disputes (`admin.yoursaas` → `/dashboard/disputes`)

---

## Main lifecycle

```mermaid
flowchart TD
    subgraph start["1. Start"]
        A[Client opens contract on live listing] --> B{Valid tier + scope + deadline?}
        B -->|No| X1[Error]
        B -->|Yes| C["pending_developer_acceptance"]
    end

    subgraph dev_gate["2. Developer gate"]
        C --> D{Developer decision}
        D -->|Accept| E["awaiting_client_payment"]
        D -->|Reject| F["rejected_by_developer ❌"]
        C -->|Client cancels| G["cancelled_by_client ❌"]
    end

    subgraph pay["3. Escrow payment"]
        E --> H[Client pays gross via Razorpay]
        H --> I{Webhook payment.captured}
        I -->|Yes| J["active — work begins"]
        I -->|No / delay| E
    end

    subgraph amend["4. Amendments (while active)"]
        J --> K{Either party proposes amendment}
        K --> L["Amendment pending_counterparty"]
        L --> M{Other party approves?}
        M -->|No| J
        M -->|Yes, extra ₹0| J2[Applied — contract v+1]
        M -->|Yes, extra ₹>0| N["awaiting_amendment_payment"]
        N --> O[Client pays amendment via Razorpay]
        O --> P{Webhook captured}
        P -->|Yes| J2
        J2 --> J
    end

    subgraph deliver["5. Delivery"]
        J --> Q[Developer submits deliverables]
        Q --> R["submitted"]
        R --> S["Client decision window starts<br/>(CONTRACT_CLIENT_DECISION_DAYS)"]
    end

    subgraph client_decision["6. Client decision"]
        S --> T{Client action?}
        T -->|Accept| U["completed ✅"]
        T -->|Request revision| J
        T -->|Open dispute| V["disputed — escrow frozen"]
        T -->|No action until deadline| W[Cron / page load auto-complete]
        W --> U
    end

    subgraph dispute["7. Dispute (admin)"]
        V --> Y[Admin resolves split:<br/>refund client / pay dev / retain platform]
        Y --> U
    end

    subgraph money["8. Money on completion"]
        U --> Z[Ledger: 2.36% fee + escrow split<br/>platform % / developer %]
        Z --> AA{CONTRACT_AUTO_SETTLEMENT_ENABLED?}
        AA -->|Yes| AB[Razorpay refund to client if any]
        AB --> AC[RazorpayX payout to dev bank if validated]
        AA -->|No| AD[Ledger only — skipped]
        AC --> AE["settlement_status: executed / partial / failed"]
        AD --> AE
    end

    F --> END1((End))
    G --> END1
    U --> END2((End))
```

---

## Status cheat sheet

| Status | Who acts next |
|--------|----------------|
| `pending_developer_acceptance` | Developer accept/reject · client can cancel |
| `awaiting_client_payment` | Client pays escrow |
| `active` | Developer works · either side can propose amendments |
| `awaiting_amendment_payment` | Client pays approved amendment top-up |
| `submitted` | Client accept / revision / dispute · or auto-complete |
| `disputed` | Admin resolves |
| `completed` | Done — settlement runs |
| `rejected_by_developer` / `cancelled_by_client` | Closed |

All statuses are defined in `ContractStatus` in `src/services/contract.service.ts`.

---

## Money flow (successful completion)

```mermaid
flowchart LR
    subgraph client_pays["Client pays"]
        GROSS[Gross checkout ₹]
    end

    subgraph split["Split at payment"]
        GROSS --> FEE["2.36% non-refundable fee<br/>(platform)"]
        GROSS --> ESCROW[Escrow pool]
    end

    subgraph on_success["On completed (no dispute)"]
        ESCROW --> DEV["Developer ~80% of escrow<br/>(env: 100 − platform %)"]
        ESCROW --> PLAT["Platform ~20% of escrow"]
        FEE --> PLAT2[Platform keeps fee]
    end

    subgraph dispute_split["On dispute resolution"]
        ESCROW --> R1[Refund client]
        ESCROW --> R2[Release developer]
        ESCROW --> R3[Retain platform]
        FEE --> R3
    end
```

---

## Portals and integrations

```mermaid
flowchart TB
    subgraph portals["Portals"]
        C[Client — yoursaas]
        D[Developer — developer.yoursaas]
        A[Admin — admin.yoursaas]
    end

    C --> C1[Start contract · Pay escrow · Amendments · Accept/Dispute]
    D --> D1[Accept/Reject · Submit · Propose/Approve amendments]
    A --> A1[Resolve disputes]
    C --> API[(main-server API)]
    D --> API
    A --> API
    API --> RZ[Razorpay Checkout]
    API --> RZX[RazorpayX Payouts]
    API --> DB[(PostgreSQL)]
    API --> ST[GetStream DM bot]
```

---

## Happy path (sequence)

```mermaid
sequenceDiagram
    participant C as Client
    participant D as Developer
    participant API as YourSaaS API
    participant RZ as Razorpay

    C->>API: Create contract
    API-->>C: pending_developer_acceptance
    D->>API: Accept
    API-->>D: awaiting_client_payment
    C->>RZ: Pay gross
    RZ->>API: Webhook captured
    API-->>C: active
    D->>API: Submit deliverables
    API-->>C: submitted
    C->>API: Accept completion
    API->>API: Ledger split + optional refund/payout
    API-->>C: completed
```

---

## API routes (reference)

| Role | Base path | Notable endpoints |
|------|-----------|-------------------|
| Client | `/api/user/contracts` | `POST /`, `POST /:id/pay-escrow`, `POST /:id/amendments`, `POST /:id/accept-completion`, `POST /:id/open-dispute` |
| Developer | `/api/developer/contracts` | `POST /:id/accept`, `POST /:id/reject`, `POST /:id/submit`, `POST /:id/amendments` |
| Admin | `/api/admin/contracts` | `GET /disputes`, `POST /disputes/:id/resolve` |
| Webhook | `/api/developer/payment/webhook/razorpay` | `payment.captured` → activate contract / apply amendment |

Public pricing preview: `GET /api/public/products/by-id/:id/contract-pricing`

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONTRACT_PLATFORM_COMMISSION_PERCENT` | `20` | Platform % of **escrow** on success |
| `CONTRACT_CLIENT_DECISION_DAYS` | `14` | Days after submit before auto-complete |
| `CONTRACT_AUTO_COMPLETE_INTERVAL_MS` | `300000` | Background job interval (5 min) |
| `CONTRACT_AUTO_SETTLEMENT_ENABLED` | `false` | Razorpay refunds + RazorpayX payouts after settlement |
| `RAZORPAY_*` | — | Checkout + webhooks |
| `RAZORPAYX_SOURCE_ACCOUNT_NUMBER` | — | Payouts + bank validation |

See `.env.example` for full list.

---

## Production checklist

1. Set `CONTRACT_AUTO_SETTLEMENT_ENABLED=true` when live keys and RazorpayX are ready.
2. Configure Razorpay webhook → `payment.captured` (and monitor payout/refund events).
3. Developers must complete **payout bank verification** before payouts succeed.
4. Ensure CORS includes client, developer, and admin portal origins.
5. GetStream: buyer–seller DM must exist for contract bot messages.

---

## Related files

| Area | Path |
|------|------|
| Core service | `src/services/contract.service.ts` |
| Settlement | `src/services/contract-settlement.service.ts` |
| Payouts | `src/services/razorpay-x-payout.service.ts` |
| Payments | `src/services/payment.service.ts` |
| Auto-complete job | `src/jobs/contract-jobs.ts` |
| Schema / migration | `src/db/schema.ts`, `drizzle/0021_marketplace_contracts.sql`, `drizzle/0022_contract_settlement.sql` |
