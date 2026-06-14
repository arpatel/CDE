const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat, TableOfContents
} = require('docx');
const fs = require('fs');

const COLORS = {
  headerBg: '1F3864', headerText: 'FFFFFF', accent: '2E75B6',
  border: 'BDD7EE', rowAlt: 'EBF3FA', rowPlain: 'FFFFFF',
  phase1: 'C6EFCE', phase2: 'FFEB9C', phase3: 'FCE4D6', phase4: 'DAEEF3', phase5: 'E2EFDA',
  phase1Dark: '375623', phase2Dark: '7E5A00', phase3Dark: '843C0C', phase4Dark: '17375E', phase5Dark: '375623',
};

const bdr = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const bdrs = { top: bdr, bottom: bdr, left: bdr, right: bdr };

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.accent, space: 1 } },
  children: [new TextRun({ text, bold: true, size: 36, color: COLORS.headerBg, font: 'Arial' })],
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 80 },
  children: [new TextRun({ text, bold: true, size: 28, color: COLORS.accent, font: 'Arial' })],
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 60 },
  children: [new TextRun({ text, bold: true, size: 24, color: '333333', font: 'Arial' })],
});
const para = (text) => new Paragraph({
  spacing: { before: 60, after: 80 },
  children: [new TextRun({ text, size: 22, font: 'Arial' })],
});
const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { before: 40, after: 40 },
  children: [new TextRun({ text, size: 22, font: 'Arial' })],
});
const pb = () => new Paragraph({ children: [new PageBreak()] });

function cell(text, opts = {}) {
  const { bg = COLORS.rowPlain, bold = false, color = '000000', align = AlignmentType.LEFT, width } = opts;
  const cellProps = {
    borders: bdrs,
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, bold, color, size: 20, font: 'Arial' })],
    })],
  };
  if (width) cellProps.width = { size: width, type: WidthType.DXA };
  return new TableCell(cellProps);
}

function tbl(headers, rows, colWidths) {
  return new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    spacing: { before: 120, after: 160 },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bg: COLORS.headerBg, bold: true, color: COLORS.headerText, width: colWidths[i] })),
      }),
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => typeof c === 'string'
          ? cell(c, { bg: i === 0 ? COLORS.rowAlt : COLORS.rowPlain, width: colWidths[i] })
          : { ...c, width: colWidths[i] }),
      })),
    ],
  });
}

function phaseHeader(num, name, duration, color, darkColor) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    shading: { fill: color, type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 20, color: darkColor, space: 2 } },
    children: [
      new TextRun({ text: `  Phase ${num}: ${name}`, bold: true, size: 26, font: 'Arial', color: darkColor }),
      new TextRun({ text: `   (${duration})`, size: 22, font: 'Arial', color: darkColor }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────

const content = [
  // Cover
  new Paragraph({ spacing: { before: 2880 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DEVELOPMENT ROADMAP', bold: true, size: 56, font: 'Arial', color: COLORS.headerBg })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 120 }, children: [new TextRun({ text: 'Enterprise CDE & Construction Collaboration Platform', size: 36, font: 'Arial', color: COLORS.accent })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: 'Version 1.0  |  18-Month Delivery Plan', size: 24, font: 'Arial', color: '777777' })] }),
  pb(),

  // TOC
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, font: 'Arial', color: COLORS.headerBg })] }),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  pb(),

  // 1. Overview
  h1('1. Delivery Overview'),
  para('The CDE platform is delivered across five structured phases over 18 months. Each phase builds on the previous and delivers independently usable functionality, allowing early adopters to onboard and provide feedback before the full platform is complete. Delivery follows a two-week sprint cadence using the Scrum framework.'),

  tbl(
    ['Metric', 'Value'],
    [
      ['Total Duration', '18 months (72 sprints of 2 weeks each)'],
      ['Delivery Methodology', 'Agile Scrum with SAFe-lite Program Increments (PI) every 10 weeks'],
      ['Sprint Length', '2 weeks'],
      ['Team Size', '42 people across 6 squads'],
      ['Environments', 'Development → Staging → UAT → Production'],
      ['Release Cadence', 'Bi-weekly to Staging; monthly to Production'],
      ['MVP Target', 'End of Phase 2 (Month 8)'],
      ['Full Go-Live', 'End of Phase 5 (Month 18)'],
    ],
    [4000, 5360]
  ),

  // 2. Team Structure
  h1('2. Team Structure'),
  para('The delivery team is organised into six cross-functional squads, each owning a domain of the platform. Each squad includes a Product Owner, Tech Lead, developers, and QA engineers.'),

  tbl(
    ['Squad', 'Domain', 'Members', 'Tech Lead Focus'],
    [
      ['Squad 1 — Foundation', 'Identity, Auth, Org, Tenancy, Admin Portal', '7', 'Security, multi-tenancy, SSO/MFA'],
      ['Squad 2 — Documents', 'Document Mgmt, Drawing Mgmt, Search, File Storage', '8', 'S3 integration, OCR, Elasticsearch'],
      ['Squad 3 — Workflows', 'Workflow Engine, RFI, Submittals, Transmittals', '8', 'State machines, SLA, audit'],
      ['Squad 4 — Field', 'Snagging, QA, HSE, Forms, Mobile App', '8', 'React Native, offline sync, GPS'],
      ['Squad 5 — Intelligence', 'BIM Viewer, Reporting, Analytics, Integrations', '7', 'IFC parsing, BI, API connectors'],
      ['Squad 6 — Platform', 'Infra, DevOps, Security, Performance, API Gateway', '4', 'Kubernetes, CI/CD, observability'],
    ],
    [2400, 3200, 1200, 2560]
  ),

  tbl(
    ['Role', 'Count', 'Responsibility'],
    [
      ['Engineering Manager', '1', 'Overall delivery, cross-squad coordination, stakeholder reporting'],
      ['Product Owner (per squad)', '6', 'Backlog prioritisation, acceptance criteria, sprint goals'],
      ['Tech Lead (per squad)', '6', 'Architecture decisions, code review standards, technical risk'],
      ['Senior Full-Stack Developer', '12', 'Feature development, API design, code reviews'],
      ['Full-Stack Developer', '10', 'Feature development and unit testing'],
      ['React Native Developer', '3', 'Mobile application (iOS & Android)'],
      ['DevOps / SRE Engineer', '4', 'Infrastructure, CI/CD, monitoring, incident response'],
      ['QA Engineer', '6', 'Test plans, automation, regression, UAT support'],
      ['UI/UX Designer', '2', 'Design system, wireframes, prototypes, design QA'],
      ['Business Analyst', '2', 'Requirements, user stories, acceptance criteria, stakeholder liaison'],
      ['Security Engineer', '1', 'Threat modelling, penetration testing, compliance audits'],
    ],
    [3200, 1000, 5160]
  ),

  // 3. Technology Stack
  h1('3. Technology Stack'),
  tbl(
    ['Layer', 'Technology', 'Rationale'],
    [
      ['Frontend', 'React 18 + Next.js 14 + TypeScript', 'SSR for SEO and performance; large ecosystem'],
      ['Mobile', 'React Native + Expo', 'Code sharing with web; offline-first architecture'],
      ['UI Component Library', 'Shadcn/ui + Tailwind CSS', 'Accessible, customisable, consistent design system'],
      ['State Management', 'Zustand + React Query (TanStack)', 'Server state + client state separation'],
      ['Backend', 'Node.js 20 + TypeScript + Fastify', 'High throughput; TypeScript type safety end-to-end'],
      ['ORM', 'Prisma', 'Type-safe DB access; migration management'],
      ['Database', 'PostgreSQL 16 (AWS RDS Aurora)', 'ACID compliance; RLS for multi-tenancy'],
      ['Cache', 'Redis 7 (ElastiCache)', 'Session, rate limiting, real-time pub/sub'],
      ['Search', 'Elasticsearch 8', 'Full-text document and metadata search'],
      ['Analytics DB', 'ClickHouse', 'High-performance time-series reporting queries'],
      ['File Storage', 'AWS S3 + CloudFront CDN', 'Scalable, durable, presigned URL uploads'],
      ['Message Queue', 'AWS SQS + SNS', 'Decoupled async processing; fan-out notifications'],
      ['Container Orchestration', 'Kubernetes (EKS) + Helm', 'Auto-scaling, rolling deployments, self-healing'],
      ['Service Mesh', 'Istio', 'mTLS between services; traffic policies; observability'],
      ['CI/CD', 'GitHub Actions + ArgoCD', 'GitOps; automated test → build → deploy pipeline'],
      ['Monitoring', 'Prometheus + Grafana + Loki + Jaeger', 'Metrics, logs, distributed traces in one stack'],
      ['BIM Viewer', 'web-ifc-viewer (Three.js)', 'Open-source IFC 2x3/4 viewer; no vendor lock-in'],
      ['OCR', 'AWS Textract', 'Managed OCR with table and form extraction'],
      ['Email', 'AWS SES + React Email', 'Transactional email with branded HTML templates'],
      ['SMS / Push', 'Twilio SMS + Firebase FCM', 'Reliable delivery; cross-platform push notifications'],
      ['Auth', 'Auth0 / Keycloak (self-hosted option)', 'OAuth 2.0, OIDC, SAML, MFA, SSO out of the box'],
    ],
    [2400, 3000, 4000]
  ),

  // 4. Phases
  h1('4. Development Phases & Milestones'),

  // Phase 1
  phaseHeader(1, 'Foundation & Core Infrastructure', 'Months 1–4 | Sprints 1–8', COLORS.phase1, COLORS.phase1Dark),
  para('Establish the technical foundation: cloud infrastructure, CI/CD pipeline, identity platform, multi-tenancy, organisation management, and the project creation module. All subsequent phases build on this base.'),

  h3('Deliverables'),
  bullet('Cloud infrastructure provisioned (EKS, RDS, Redis, S3, Elasticsearch, CloudFront)'),
  bullet('CI/CD pipeline: GitHub Actions → staging → production with automated tests'),
  bullet('API Gateway with rate limiting, JWT validation, and versioning'),
  bullet('Identity & Auth Service: registration, login, OAuth 2.0, JWT, refresh tokens'),
  bullet('SSO integration: Microsoft Entra ID (SAML 2.0 / OIDC)'),
  bullet('MFA: TOTP (Google Authenticator / Authy compatible)'),
  bullet('Multi-tenant architecture with schema-per-tenant RLS enforcement'),
  bullet('Organisation management: company hierarchy, contact management, invitations'),
  bullet('User & role management: RBAC with system and custom roles, permission model'),
  bullet('Project creation, project templates, project dashboard skeleton'),
  bullet('Admin portal: tenant management, user provisioning, feature flags'),
  bullet('Audit logging service: immutable, queryable, with S3 archival'),
  bullet('Design system: component library, typography, colour tokens, spacing system'),
  bullet('Notification service: email (SES), in-app notification infrastructure'),

  h3('Sprint Breakdown'),
  tbl(
    ['Sprint', 'Focus', 'Key Stories'],
    [
      ['S1', 'Infra setup', 'EKS cluster, RDS, Redis, S3, base Helm charts, GitHub Actions pipeline'],
      ['S2', 'Auth core', 'User registration, login, JWT, refresh token, password reset'],
      ['S3', 'Auth advanced', 'SSO (Entra ID), MFA (TOTP), session management, rate limiting'],
      ['S4', 'Multi-tenancy', 'Tenant provisioning, schema isolation, RLS policies, API tenant context'],
      ['S5', 'Org & Users', 'Organisation CRUD, user invitations, user-org membership, roles'],
      ['S6', 'RBAC & Permissions', 'Permission model, security groups, admin portal — user management'],
      ['S7', 'Projects', 'Project CRUD, templates, member management, project dashboard API'],
      ['S8', 'Audit & Notifications', 'Audit service, email notifications (SES), in-app notification store'],
    ],
    [800, 2400, 6160]
  ),

  tbl(
    ['Milestone', 'Date', 'Acceptance Criteria'],
    [
      ['M1.1 — Infra Ready', 'End of Sprint 1', 'All cloud resources provisioned; CI/CD deploys to staging'],
      ['M1.2 — Auth Live', 'End of Sprint 3', 'Login, SSO, and MFA working end-to-end in staging'],
      ['M1.3 — Phase 1 Complete', 'End of Sprint 8', 'Admin can create tenant, invite users, create project; audit trail captured'],
    ],
    [2800, 1800, 4760]
  ),

  // Phase 2
  phaseHeader(2, 'Document & Drawing Management + Workflow Engine', 'Months 5–8 | Sprints 9–16', COLORS.phase2, COLORS.phase2Dark),
  para('Deliver the core value proposition: document management with version control, drawing management, and the workflow engine. MVP is complete at end of this phase.'),

  h3('Deliverables'),
  bullet('Folder hierarchy with inherited and override permissions'),
  bullet('Document upload (single + bulk), presigned S3 URLs, virus scanning'),
  bullet('Document versioning, revision labels, check-in/check-out, file locking'),
  bullet('Document numbering schemes, metadata, tags, custom fields'),
  bullet('OCR pipeline: Textract → text extraction → Elasticsearch indexing'),
  bullet('Full-text and faceted search across all document metadata and OCR content'),
  bullet('Document download (signed S3 URL), print control, watermarking'),
  bullet('Drawing register, drawing upload, revision management'),
  bullet('Browser-based drawing viewer with markup tools (annotations, clouds, stamps)'),
  bullet('Drawing overlay comparison (two-revision ghost overlay)'),
  bullet('Workflow engine: visual template designer, sequential and parallel steps'),
  bullet('Conditional routing, SLA tracking, escalation chains, delegation'),
  bullet('Workflow applied to documents: approval and review workflows'),
  bullet('RFI module: create, assign, respond, close, void lifecycle'),
  bullet('Submittal register: material submittals and shop drawings with approval cycle'),
  bullet('Transmittal module: bundle, distribute, acknowledge'),
  bullet('Meeting management: agenda, minutes, action items, attendance, distribution'),

  h3('Sprint Breakdown'),
  tbl(
    ['Sprint', 'Focus', 'Key Stories'],
    [
      ['S9', 'Folder & Upload', 'Folder CRUD, permission inheritance, presigned upload URL, bulk upload UI'],
      ['S10', 'Doc Versioning', 'Revision model, check-in/check-out, file locking, version history UI'],
      ['S11', 'Metadata & Search', 'Custom metadata, tags, Elasticsearch indexing, full-text search UI'],
      ['S12', 'OCR & Drawings', 'Textract pipeline, drawing upload, drawing register UI'],
      ['S13', 'Drawing Tools', 'Markup tools, overlay comparison, drawing viewer integration'],
      ['S14', 'Workflow Engine', 'Workflow template designer, sequential/parallel engine, SLA engine'],
      ['S15', 'RFI + Submittals', 'RFI lifecycle, submittal register, approval actions, resubmission'],
      ['S16', 'Transmittals + Meetings', 'Transmittal bundling, acknowledgement, meeting CRUD, minutes, action items'],
    ],
    [800, 2200, 6360]
  ),

  tbl(
    ['Milestone', 'Date', 'Acceptance Criteria'],
    [
      ['M2.1 — Documents Live', 'End of Sprint 11', 'Upload, version, search, and download documents end-to-end'],
      ['M2.2 — Workflows Live', 'End of Sprint 14', 'Approval workflow started, steps actioned, audit captured'],
      ['M2.3 — MVP Complete', 'End of Sprint 16', 'Documents, Drawings, Workflows, RFI, Submittals, Transmittals all working in UAT'],
    ],
    [2800, 1800, 4760]
  ),

  // Phase 3
  phaseHeader(3, 'Field Tools: QA, HSE, Snagging & Mobile', 'Months 9–12 | Sprints 17–24', COLORS.phase3, COLORS.phase3Dark),
  para('Extend the platform to field users with mobile-first tools for snagging, quality management, health & safety, and dynamic forms. Offline sync is a core requirement for this phase.'),

  h3('Deliverables'),
  bullet('Mobile app (React Native): iOS and Android builds on App Store and Google Play'),
  bullet('Offline mode: cached data sync, conflict resolution strategy (last-write-wins with conflict flagging)'),
  bullet('Snagging / punch list: create items, assign, photo attach, GPS, pin on drawing, resolve'),
  bullet('QA module: NCR lifecycle, inspection requests, test requests, configurable checklists'),
  bullet('HSE module: incident reporting, safety observations, toolbox talks (with attendance), risk assessments, permit management'),
  bullet('Forms engine: drag-and-drop builder, conditional logic, all field types, offline completion'),
  bullet('Digital signatures: draw or type, bound to user identity and timestamp'),
  bullet('Task management: personal and team tasks, due dates, priorities, Kanban board'),
  bullet('Push notifications (FCM), biometric authentication, QR/barcode scanning'),
  bullet('Photo compression, GPS geo-tagging, offline-to-online sync with progress indicator'),

  h3('Sprint Breakdown'),
  tbl(
    ['Sprint', 'Focus', 'Key Stories'],
    [
      ['S17', 'Mobile Skeleton', 'React Native scaffold, navigation, auth, offline storage (WatermelonDB)'],
      ['S18', 'Offline Sync', 'Sync engine, conflict resolution, network status detection, upload queue'],
      ['S19', 'Snagging', 'Punch list CRUD, photo attach, GPS, drawing pin, assignment, status flow'],
      ['S20', 'QA Module', 'NCR lifecycle, inspection requests, checklist builder, test requests'],
      ['S21', 'HSE Module', 'Incident reporting, safety observations, permit management, risk assessments'],
      ['S22', 'Toolbox & Attendance', 'Toolbox talks, digital attendance, distribution, stats (LTIFR, TRIFR)'],
      ['S23', 'Forms Engine', 'Form builder drag-and-drop, conditional logic, digital signatures, PDF export'],
      ['S24', 'Tasks + Mobile Polish', 'Task management, push notifications, QR/barcode scan, biometric auth'],
    ],
    [800, 2200, 6360]
  ),

  tbl(
    ['Milestone', 'Date', 'Acceptance Criteria'],
    [
      ['M3.1 — Mobile Beta', 'End of Sprint 18', 'App installs on iOS and Android; offline sync working in test'],
      ['M3.2 — Field Modules Live', 'End of Sprint 22', 'Snagging, NCR, Incident reporting working on mobile with offline support'],
      ['M3.3 — Phase 3 Complete', 'End of Sprint 24', 'Forms, tasks, HSE permits, push notifications all live and UAT-signed'],
    ],
    [2800, 1800, 4760]
  ),

  // Phase 4
  phaseHeader(4, 'BIM, Reporting, Analytics & Integrations', 'Months 13–16 | Sprints 25–32', COLORS.phase4, COLORS.phase4Dark),
  para('Add advanced capabilities: BIM model management and viewer, comprehensive reporting and analytics, and third-party system integrations (ERP, scheduling, BI tools).'),

  h3('Deliverables'),
  bullet('BIM Service: IFC model upload, versioning, federated model viewer (web-ifc-viewer)'),
  bullet('Model element linking to documents, RFIs, NCRs, and punch list items'),
  bullet('BCF (BIM Collaboration Format) import/export'),
  bullet('Clash detection report import from Navisworks; clash assignment workflow'),
  bullet('4D simulation: link model elements to Primavera P6 / MS Project activities'),
  bullet('Asset register: asset CRUD, classification, location, O&M document linking, warranty tracking'),
  bullet('Reporting: project dashboard, KPI dashboard, custom report builder'),
  bullet('Scheduled report delivery by email; PDF and Excel export'),
  bullet('Power BI connector: live data push; pre-built report templates'),
  bullet('Primavera P6 integration: import schedule, sync milestones and 4D'),
  bullet('Microsoft 365 integration: SharePoint document sync, Teams notifications, Outlook calendar'),
  bullet('SAP / Oracle ERP integration: supplier and purchase order data sync'),
  bullet('Autodesk Revit add-in: push documents to CDE directly from Revit'),
  bullet('Webhook framework: configurable outbound webhooks for all platform events'),
  bullet('REST API developer portal with OpenAPI 3.0 documentation'),

  h3('Sprint Breakdown'),
  tbl(
    ['Sprint', 'Focus', 'Key Stories'],
    [
      ['S25', 'BIM Upload & Viewer', 'IFC model upload, versioning, federated viewer, element properties panel'],
      ['S26', 'BIM Linking & BCF', 'Link model elements to RFI/NCR/snag, BCF import/export, clash import'],
      ['S27', 'Asset Register', 'Asset CRUD, classification, location, O&M doc links, warranty alerts'],
      ['S28', 'Reporting Engine', 'ClickHouse data pipeline, project dashboard, KPI cards, chart library'],
      ['S29', 'Custom Reports & BI', 'Custom report builder, scheduled delivery, Power BI connector'],
      ['S30', 'M365 Integration', 'SharePoint sync, Teams notifications, Outlook calendar integration'],
      ['S31', 'ERP & Scheduling', 'SAP/Oracle supplier sync, Primavera P6 schedule import, 4D linking'],
      ['S32', 'API Portal & Webhooks', 'OpenAPI docs, developer portal, webhook framework, Revit add-in'],
    ],
    [800, 2400, 6160]
  ),

  tbl(
    ['Milestone', 'Date', 'Acceptance Criteria'],
    [
      ['M4.1 — BIM Live', 'End of Sprint 26', 'IFC models uploaded, viewable in browser, elements linked to RFIs/NCRs'],
      ['M4.2 — Integrations Live', 'End of Sprint 31', 'M365, Primavera P6, and SAP connectors working in staging'],
      ['M4.3 — Phase 4 Complete', 'End of Sprint 32', 'All reporting, BIM, assets, and integrations UAT-signed'],
    ],
    [2800, 1800, 4760]
  ),

  // Phase 5
  phaseHeader(5, 'Hardening, Performance & Go-Live', 'Months 17–18 | Sprints 33–36', COLORS.phase5, COLORS.phase5Dark),
  para('Stabilisation, performance optimisation, security hardening, data migration tooling, onboarding resources, and controlled go-live rollout.'),

  h3('Deliverables'),
  bullet('Performance testing: load test to 10,000 concurrent users; P95 response times < 3s for all key pages'),
  bullet('Security: third-party penetration test; resolve all Critical and High findings before go-live'),
  bullet('Accessibility: WCAG 2.1 AA compliance audit and remediation'),
  bullet('Data migration tooling: import from Aconex, Procore, SharePoint, or custom CSV'),
  bullet('User onboarding: in-app guided tours (Shepherd.js), contextual help, knowledge base'),
  bullet('Admin onboarding wizard: step-by-step tenant configuration on first login'),
  bullet('Multi-language support (i18n): English, Arabic, French as launch languages'),
  bullet('Disaster recovery drill: simulate region failure; validate RTO < 1 hour'),
  bullet('SOC 2 Type II evidence collection and ISO 27001 readiness review'),
  bullet('Phased rollout: Pilot customer → 5 customers → general availability'),

  h3('Sprint Breakdown'),
  tbl(
    ['Sprint', 'Focus', 'Key Stories'],
    [
      ['S33', 'Performance & Load', 'Load testing (k6), query optimisation, CDN tuning, Redis cache warming'],
      ['S34', 'Security & a11y', 'Pen test remediation, WCAG audit, CSP headers, SOC 2 evidence'],
      ['S35', 'Migration & Onboarding', 'Data migration CLI, import templates, guided tours, admin wizard, i18n'],
      ['S36', 'Go-Live & Rollout', 'Pilot cutover, runbook, DR drill, monitoring dashboards, hypercare support'],
    ],
    [800, 2400, 6160]
  ),

  tbl(
    ['Milestone', 'Date', 'Acceptance Criteria'],
    [
      ['M5.1 — Pen Test Clear', 'End of Sprint 34', 'No Critical/High findings unresolved; WCAG AA pass'],
      ['M5.2 — Pilot Go-Live', 'End of Sprint 35', 'First paying customer live on production with support hypercare'],
      ['M5.3 — General Availability', 'End of Sprint 36', 'Platform open for onboarding; all modules live; SLAs activated'],
    ],
    [2800, 1800, 4760]
  ),

  pb(),

  // 5. Definition of Done
  h1('5. Definition of Done'),
  para('Every user story must meet all of the following criteria before it is accepted as complete:'),
  bullet('Code reviewed and approved by at least one other developer (PR review)'),
  bullet('Unit tests written with minimum 80% coverage on new code (Jest)'),
  bullet('Integration tests passing in CI (all API endpoints tested against staging DB)'),
  bullet('No Critical or High severity SonarQube findings introduced'),
  bullet('Accessibility: no new WCAG AA violations (axe-core automated scan)'),
  bullet('API changes documented in OpenAPI spec and changelog'),
  bullet('Feature flag configured if rollout is gated (LaunchDarkly)'),
  bullet('Deployed to Staging and smoke-tested by QA engineer'),
  bullet('Product Owner has reviewed and accepted the story in the sprint demo'),
  bullet('Audit logging verified for all create/update/delete actions'),

  // 6. Risks
  h1('6. Risk Register'),
  tbl(
    ['Risk', 'Probability', 'Impact', 'Mitigation'],
    [
      ['OCR accuracy below threshold on hand-drawn drawings', 'Medium', 'High', 'Pilot AWS Textract + fallback to manual metadata entry; set expectation in UAT'],
      ['BIM model file sizes causing upload timeouts (>1 GB IFC files)', 'High', 'Medium', 'Multipart S3 upload; chunked streaming; progress indicator; server-side background processing'],
      ['Integration partner API changes (Primavera P6, SAP)', 'Medium', 'High', 'Maintain versioned adapters; monitor partner changelogs; allocate buffer sprints'],
      ['Scope creep from stakeholder requirements during Phase 3–4', 'High', 'High', 'Change control process via Product Owner; backlog grooming gate; sprint commitment locked'],
      ['Offline sync conflict resolution edge cases on mobile', 'Medium', 'High', 'Define conflict policy in Phase 3 design; automated conflict tests; user notification for manual resolution'],
      ['Security vulnerability discovered before go-live', 'Low', 'Critical', 'Pen test scheduled in Phase 5 Sprint 34; bug bounty programme post-launch'],
      ['Performance degradation at scale (>10,000 concurrent users)', 'Low', 'High', 'Load testing in Phase 5; horizontal pod autoscaling; CDN for static and file assets'],
      ['Third-party library deprecation (web-ifc-viewer, docx)', 'Low', 'Medium', 'Pin library versions; monitor GitHub releases; allocate upgrade sprints quarterly'],
    ],
    [2800, 1200, 1200, 4160]
  ),

  // 7. Success Metrics
  h1('7. Success Metrics (KPIs)'),
  tbl(
    ['Metric', 'Target', 'Measurement Method'],
    [
      ['Email document exchange reduction', '90%', 'Transmittal volume vs. baseline email volume (tracked via survey)'],
      ['Document version traceability', '100%', 'Every document has complete revision history in the audit trail'],
      ['Document retrieval latency (P95)', '< 3 seconds', 'Synthetic monitoring via Grafana; Elasticsearch query response time'],
      ['Platform availability', '99.9% uptime', 'Uptime Robot + Grafana SLA dashboard; excludes scheduled maintenance'],
      ['RFI average response time', '< 5 business days', 'Calculated in reporting module; measured per project'],
      ['NCR close-out rate within SLA', '> 85%', 'NCR dashboard with SLA breaches highlighted'],
      ['Mobile app offline sync success rate', '> 99%', 'Sync event logs in ClickHouse; failed sync rate metric'],
      ['User adoption rate (DAU/MAU)', '> 60%', 'Analytics from Auth service login events per tenant'],
      ['Sprint velocity stability', '±10% variance', 'Jira velocity chart per squad; reviewed in PI retrospective'],
    ],
    [3000, 2000, 4360]
  ),
];

// Build document
const doc = new Document({
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }, {
        level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
      }],
    }],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: COLORS.headerBg },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: COLORS.accent },
        paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '333333' },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.accent, space: 1 } },
        children: [
          new TextRun({ text: 'CDE Platform — Development Roadmap', size: 18, font: 'Arial', color: '555555' }),
          new TextRun({ text: '\tv1.0  |  CONFIDENTIAL', size: 18, font: 'Arial', color: '555555', bold: true }),
        ],
        tabStops: [{ type: 'right', position: 9360 }],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.accent, space: 1 } },
        children: [
          new TextRun({ text: '© 2025 Enterprise CDE Platform', size: 18, font: 'Arial', color: '777777' }),
          new TextRun({ text: '\tPage ', size: 18, font: 'Arial', color: '777777' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '777777' }),
          new TextRun({ text: ' of ', size: 18, font: 'Arial', color: '777777' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Arial', color: '777777' }),
        ],
        tabStops: [{ type: 'right', position: 9360 }],
      })] }),
    },
    children: content,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/sessions/sleepy-eager-bardeen/mnt/outputs/CDE_Development_Roadmap_v1.0.docx', buf);
  console.log('Done: CDE_Development_Roadmap_v1.0.docx');
});
