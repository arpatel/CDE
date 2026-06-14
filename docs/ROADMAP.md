# CDE Platform — Development Roadmap (Compressed)

18-month, 5-phase delivery. Source: `CDE_Development_Roadmap_v1.0.docx`. Agile Scrum, 2-week sprints, MVP at end of Phase 2.

## Phases

| Phase | Window | Theme | Key deliverables |
|-------|--------|-------|------------------|
| **1. Foundation** | M1–4 / S1–8 | Core infra + identity | Cloud infra, CI/CD, API gateway, Auth (OAuth2/JWT/refresh), SSO (Entra), MFA (TOTP), multi-tenancy + RLS, org mgmt, RBAC, projects + templates, admin portal, audit, notifications, design system |
| **2. Docs + Workflow** | M5–8 / S9–16 | Core value (MVP) | Folders + permissions, upload (presigned S3), versioning + check-in/out, metadata/tags, OCR (Textract→ES), search, drawings + markup + overlay, workflow engine (SLA/escalation/delegation), RFI, submittals, transmittals, meetings |
| **3. Field + Mobile** | M9–12 / S17–24 | Field tools | React Native app, offline sync (WatermelonDB), snagging, QA (NCR/inspection/checklist), HSE (incident/observation/toolbox/permit/risk), forms engine + signatures, tasks, push, biometric, QR |
| **4. BIM + Analytics** | M13–16 / S25–32 | Advanced | IFC viewer + federation, element linking, BCF, clash import, 4D, asset register, reporting + KPI dashboards, custom reports, Power BI, P6/M365/SAP integrations, webhooks, API portal, Revit add-in |
| **5. Hardening** | M17–18 / S33–36 | Go-live | Load test (10k users, P95<3s), pen test, WCAG 2.1 AA, data migration (Aconex/Procore/CSV), onboarding, i18n (en/ar/fr), DR drill, SOC2/ISO27001, phased rollout |

## Tech Stack (spec)

Frontend React 18 + Next.js 14 + TS; Mobile React Native + Expo; UI Shadcn + Tailwind; state Zustand + React Query; Backend Node 20 + TS + Fastify; ORM Prisma; DB Postgres 16; cache Redis 7; search Elasticsearch 8; analytics ClickHouse; files S3 + CloudFront; queue SQS/SNS; orchestration EKS + Helm; mesh Istio; CI/CD GitHub Actions + ArgoCD; observability Prometheus/Grafana/Loki/Jaeger; BIM web-ifc-viewer; OCR Textract; email SES; SMS/push Twilio/FCM; auth Auth0/Keycloak.

## Definition of Done
PR-reviewed; ≥80% unit coverage; integration tests green; no Critical/High SonarQube; no new WCAG AA violations; OpenAPI + changelog updated; feature-flagged if gated; deployed+smoke-tested on staging; PO accepted; audit logging verified for CUD.

## Top Risks
OCR accuracy on hand-drawn; large IFC upload timeouts (multipart); integration partner API drift; scope creep (change control); offline sync conflicts; pre-go-live security finding; scale performance; library deprecation.

## Success KPIs
90% email-exchange reduction; 100% version traceability; doc retrieval P95 < 3s; 99.9% uptime; RFI response < 5 days; NCR SLA close-out > 85%; mobile sync > 99%; DAU/MAU > 60%.

## Build Order (this repo)
Following Phase 1→5: **Foundation modules first** (identity, org, RBAC, project, audit), then documents/workflow, then field modules, then BIM/reporting/integrations, then hardening. Current status in `../STATUS.md`.
