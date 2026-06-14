const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents, ExternalHyperlink
} = require('docx');
const fs = require('fs');

// ─── Helpers ────────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: '1F3864',
  headerText: 'FFFFFF',
  rowAlt: 'EBF3FA',
  rowPlain: 'FFFFFF',
  accent: '2E75B6',
  border: 'BDD7EE',
  sectionLine: '2E75B6',
};

const border = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 36, color: COLORS.headerBg, font: 'Arial' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.sectionLine, space: 1 } },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    children: [new TextRun({ text, bold: true, size: 28, color: COLORS.accent, font: 'Arial' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, size: 24, color: '333333', font: 'Arial' })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map((cell, i) => {
      const isFirst = i === 0;
      return new TableCell({
        borders,
        shading: {
          fill: isHeader ? COLORS.headerBg : (i % 2 === 0 ? COLORS.rowPlain : COLORS.rowAlt),
          type: ShadingType.CLEAR,
        },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            children: [new TextRun({
              text: cell,
              bold: isHeader,
              color: isHeader ? COLORS.headerText : '000000',
              size: 20,
              font: 'Arial',
            })],
          }),
        ],
      });
    }),
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    spacing: { before: 120, after: 120 },
    rows: [
      tableRow(headers, true),
      ...rows.map(r => tableRow(r, false)),
    ],
  });
}

// ─── Cover Page ─────────────────────────────────────────────────────────────

function coverPage() {
  return [
    new Paragraph({ spacing: { before: 2880 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'TECHNICAL SPECIFICATION DOCUMENT', bold: true, size: 52, font: 'Arial', color: COLORS.headerBg })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: 'Enterprise Common Data Environment (CDE)', size: 36, font: 'Arial', color: COLORS.accent })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: 'Construction Collaboration Platform', size: 32, font: 'Arial', color: '555555' })],
    }),
    new Paragraph({ spacing: { before: 480, after: 60 }, alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent } },
    }),
    new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Version: 1.0  |  Classification: Confidential', size: 22, font: 'Arial', color: '777777' })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Prepared by: Senior Solution Architect', size: 22, font: 'Arial', color: '777777' })],
    }),
    pageBreak(),
  ];
}

// ─── Section 1: System Architecture ─────────────────────────────────────────

function systemArchitecture() {
  return [
    h1('1. System Architecture'),
    h2('1.1 Architecture Overview'),
    para('The CDE platform is designed as a cloud-native, multi-tenant SaaS application following a microservices architecture. It is built on an API-first approach, enabling seamless integration with third-party tools such as Autodesk, Primavera P6, SAP, and Microsoft 365. The platform is deployed across multiple cloud regions to ensure data residency compliance and high availability.'),

    h2('1.2 Architecture Layers'),
    h3('Presentation Layer'),
    bullet('Web Application (React / Next.js) — Progressive Web App (PWA)'),
    bullet('Mobile Application (React Native) — iOS and Android, with offline support'),
    bullet('BIM Viewer (Forge / Three.js-based IFC viewer)'),
    bullet('Admin Portal (React) — System and tenant management'),

    h3('API Gateway Layer'),
    bullet('Centralized API Gateway (Kong / AWS API Gateway) for routing, rate limiting, and authentication'),
    bullet('GraphQL Gateway for flexible client queries (optional facade over REST)'),
    bullet('WebSocket Gateway for real-time notifications and collaboration'),
    bullet('OAuth 2.0 / OpenID Connect token validation and JWT introspection'),

    h3('Microservices Layer'),
    para('The platform is decomposed into domain-aligned microservices. Each service owns its data store and communicates via REST APIs and asynchronous messaging.'),
    makeTable(
      ['Microservice', 'Responsibility', 'Technology'],
      [
        ['Identity Service', 'Auth, SSO, MFA, user provisioning', 'Node.js + PostgreSQL'],
        ['Organization Service', 'Tenant, company, hierarchy management', 'Node.js + PostgreSQL'],
        ['Project Service', 'Project lifecycle, milestones, calendars', 'Node.js + PostgreSQL'],
        ['Document Service', 'Upload, versioning, metadata, OCR, search', 'Node.js + PostgreSQL + S3 + Elasticsearch'],
        ['Drawing Service', 'Drawing register, revisions, markups', 'Node.js + PostgreSQL + S3'],
        ['Workflow Service', 'Approval & review workflows, SLA, escalations', 'Node.js + PostgreSQL'],
        ['RFI Service', 'RFI lifecycle, assignments, responses', 'Node.js + PostgreSQL'],
        ['Submittal Service', 'Material submittals, shop drawings, approvals', 'Node.js + PostgreSQL'],
        ['Transmittal Service', 'Internal/external transmittals, acknowledgements', 'Node.js + PostgreSQL'],
        ['Meeting Service', 'Agenda, minutes, action items', 'Node.js + PostgreSQL'],
        ['Snagging Service', 'Defect logging, photos, resolution tracking', 'Node.js + PostgreSQL + S3'],
        ['Quality Service', 'NCR, inspections, checklists, test requests', 'Node.js + PostgreSQL'],
        ['HSE Service', 'Incidents, safety observations, permits', 'Node.js + PostgreSQL'],
        ['Asset Service', 'Asset register, O&M manuals, warranty', 'Node.js + PostgreSQL'],
        ['BIM Service', 'IFC model management, clash detection, model review', 'Node.js + PostgreSQL + S3'],
        ['Forms Service', 'Dynamic forms, digital signatures', 'Node.js + PostgreSQL'],
        ['Task Service', 'Personal and team tasks', 'Node.js + PostgreSQL'],
        ['Notification Service', 'Email, SMS, push, in-app notifications', 'Node.js + Redis + SQS'],
        ['Reporting Service', 'Dashboards, KPIs, custom reports, analytics', 'Python + ClickHouse'],
        ['Search Service', 'Full-text search across all entities', 'Elasticsearch'],
        ['Audit Service', 'Immutable audit trail for all actions', 'Node.js + PostgreSQL + S3'],
        ['File Storage Service', 'File upload orchestration, virus scanning, CDN', 'Node.js + S3 + CloudFront'],
        ['Integration Service', 'ERP, BIM, scheduling tool connectors, webhooks', 'Node.js + PostgreSQL'],
      ],
      [3000, 3600, 2760]
    ),

    h3('Data Layer'),
    bullet('PostgreSQL — Relational data for all domain entities (per-service schema isolation)'),
    bullet('Redis — Session cache, rate limiting, pub/sub for real-time events'),
    bullet('Elasticsearch — Full-text document search and metadata indexing'),
    bullet('ClickHouse — Time-series analytics and reporting data warehouse'),
    bullet('AWS S3 / Azure Blob — Binary file and document storage'),
    bullet('Amazon SQS / Azure Service Bus — Async message queuing between services'),

    h3('Infrastructure Layer'),
    bullet('Container Orchestration: Kubernetes (EKS / AKS) with Helm charts'),
    bullet('CI/CD: GitHub Actions + ArgoCD for GitOps-based deployments'),
    bullet('Service Mesh: Istio for inter-service mTLS, traffic management, and observability'),
    bullet('CDN: CloudFront / Azure CDN for static assets and file downloads'),
    bullet('DNS & Load Balancing: Route 53 / Azure DNS with health-check-based failover'),
    bullet('Secrets Management: AWS Secrets Manager / Azure Key Vault'),
    bullet('Monitoring: Prometheus + Grafana + Loki + Jaeger (distributed tracing)'),

    h2('1.3 Multi-Tenancy Model'),
    para('The platform uses a shared-infrastructure, schema-per-tenant model for database isolation with logical tenant separation via a tenant_id column enforced at the application layer using Row-Level Security (RLS) in PostgreSQL. File storage is isolated using tenant-prefixed S3 bucket paths.'),
    makeTable(
      ['Concern', 'Strategy'],
      [
        ['Database isolation', 'Shared DB, schema-per-tenant with RLS policies'],
        ['File storage isolation', 'S3 prefix: /{tenantId}/{projectId}/{path}'],
        ['Compute isolation', 'Shared Kubernetes pods with resource quotas'],
        ['Elasticsearch isolation', 'Index-per-tenant naming: {tenantId}_{resource}'],
        ['Cache isolation', 'Redis key prefix: tenant:{tenantId}:'],
        ['Configuration', 'Per-tenant feature flags, retention, and branding'],
        ['Data residency', 'Tenant region tag routes to nearest cloud region'],
      ],
      [4000, 5360]
    ),

    h2('1.4 Security Architecture'),
    bullet('All data encrypted at rest (AES-256) and in transit (TLS 1.3)'),
    bullet('OAuth 2.0 + OpenID Connect for authentication; JWT access tokens (15-min TTL) with refresh tokens'),
    bullet('PKCE flow for all SPA and mobile clients'),
    bullet('SAML 2.0 / Microsoft Entra ID (Azure AD) SSO integration'),
    bullet('TOTP-based MFA enforced per role configuration'),
    bullet('Zero-trust network policy: services communicate only via declared Kubernetes NetworkPolicies'),
    bullet('WAF (AWS WAF / Azure Front Door) for DDoS and OWASP Top 10 protection'),
    bullet('Immutable audit logs stored in append-only S3 with object lock'),
    bullet('Penetration testing and SOC 2 Type II compliance audits annually'),

    h2('1.5 High Availability & Disaster Recovery'),
    makeTable(
      ['Metric', 'Target', 'Mechanism'],
      [
        ['Availability', '99.9% uptime', 'Multi-AZ Kubernetes deployments + health checks'],
        ['RTO (Recovery Time Objective)', '< 1 hour', 'Hot standby in secondary region'],
        ['RPO (Recovery Point Objective)', '< 15 minutes', 'PostgreSQL streaming replication + WAL archiving'],
        ['Document retrieval latency', '< 3 seconds (P95)', 'CDN caching + Elasticsearch indexing'],
        ['File upload throughput', 'Up to 5 GB per file', 'Multipart S3 upload with presigned URLs'],
        ['Database backup', 'Continuous + daily snapshots', 'AWS RDS automated backups + S3 Glacier archival'],
      ],
      [3000, 2800, 3560]
    ),

    pageBreak(),
  ];
}

// ─── Section 2: Module Specs ─────────────────────────────────────────────────

function moduleSpecs() {
  return [
    h1('2. Module Specifications'),

    h2('2.1 Document Management'),
    para('The Document Management module is the core of the CDE. It provides a hierarchical folder structure, complete version control, metadata management, and full-text search.'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Folder hierarchy', 'Unlimited depth; folder permissions inherited or overridden per level'],
        ['Upload', 'Single and bulk upload (up to 500 files); drag-and-drop; presigned S3 URLs for direct browser-to-S3 transfer'],
        ['Max file size', '5 GB per file; enforced at API Gateway and S3 multipart upload'],
        ['Supported formats', 'PDF, DWG, DXF, IFC, RVT, XLSX, DOCX, PPTX, MP4, JPG, PNG, and all common formats'],
        ['Version control', 'Automatic versioning on upload; major (1.0, 2.0) and minor (1.1, 1.2) revisions; previous versions always retrievable'],
        ['Document numbering', 'Configurable auto-numbering schemes per project (e.g., PROJ-DOC-001)'],
        ['Metadata', 'System metadata (size, type, uploader, date) + custom metadata fields per document type'],
        ['Tags', 'Free-form tagging + taxonomy-based tag sets; tag-based search and filtering'],
        ['File locking', 'Check-out/check-in with lock owner display; admin force-unlock capability'],
        ['OCR', 'Automated OCR on PDF uploads using AWS Textract; extracted text indexed in Elasticsearch'],
        ['Search', 'Full-text search across metadata, tags, and OCR content; faceted filtering by type, date, status, author'],
        ['Audit trail', 'Every action (view, download, edit, delete) logged with user, timestamp, IP, and device'],
        ['Retention policies', 'Configurable per folder: auto-archive or delete after N days; legal hold flag prevents deletion'],
      ],
      [3200, 6160]
    ),

    h2('2.2 Drawing Management'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Drawing register', 'Centralized register with discipline, type, scale, and status fields'],
        ['Revisions', 'Sequential revision tracking (A, B, C or 0, 1, 2); superseded revisions archived'],
        ['Markups', 'Browser-based markup tool: annotations, dimensions, cloud markups, stamps, text boxes'],
        ['Overlay comparison', 'Side-by-side and overlay (ghost) comparison of two drawing revisions; change detection highlighting'],
        ['Distribution matrix', 'Define which parties receive which drawing types automatically on issue'],
        ['QR code linking', 'Generate QR codes linking to the latest revision; scannable from printed drawings on site'],
        ['Hyperlinks', 'Link hotspots within drawings to related documents, RFIs, or submittals'],
      ],
      [3200, 6160]
    ),

    h2('2.3 Workflow Engine'),
    para('A configurable workflow engine supports any approval or review process across modules. Workflows are defined using a visual designer and can be applied to documents, drawings, RFIs, submittals, and forms.'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Workflow types', 'Approval, Review, Acknowledgement, Sequential, Parallel, Conditional'],
        ['Step types', 'Single approver, group (any-one-of), group (all-must), conditional branch, notification-only'],
        ['Conditional routing', 'Branch on metadata value, form field, role, organization, or custom script'],
        ['SLA tracking', 'Per-step due date; configurable working-days calendar; SLA breach alerting'],
        ['Escalation', 'Auto-escalate to manager after N hours of inaction; configurable escalation chain'],
        ['Delegation', 'Users can delegate approval authority for a date range'],
        ['Bulk approval', 'Approve or reject multiple items in a single action from the dashboard'],
        ['Audit', 'Full history of every decision, comment, and reassignment with timestamp'],
        ['Resubmission', 'Rejected items returned to originator with comments; resubmission creates a new revision'],
        ['Templates', 'Reusable workflow templates per project template or organization'],
      ],
      [3200, 6160]
    ),

    h2('2.4 RFI Management'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Creation', 'Web and mobile; link to drawings, documents, or BIM model elements'],
        ['Assignment', 'Assign to individual or company; secondary reviewers supported'],
        ['Due dates', 'Configurable required response date; overdue alerting and reporting'],
        ['Response workflow', 'Respondent replies with answer + attachments; originator accepts or requests clarification'],
        ['Status lifecycle', 'Draft → Open → Pending Response → Under Review → Closed / Void'],
        ['Numbering', 'Auto-incremented per project (RFI-001, RFI-002); prefix configurable'],
        ['Transmittal linkage', 'RFIs can be bundled into transmittals for formal distribution'],
        ['Reporting', 'Open RFI count, average response time, overdue RFIs, RFI by discipline'],
      ],
      [3200, 6160]
    ),

    h2('2.5 Submittals'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Types', 'Material submittals, shop drawings, technical data sheets, samples, O&M manuals'],
        ['Submittal register', 'Central register with specification section, discipline, and required date'],
        ['Approval actions', 'Approved / Approved as Noted / Revise and Resubmit / Rejected'],
        ['Revision tracking', 'Each resubmission tracked as a new revision with changed pages highlighted'],
        ['Ball-in-court', 'Clear visual display of who is responsible for the next action'],
        ['Spec linking', 'Link submittals to specification sections for compliance tracking'],
      ],
      [3200, 6160]
    ),

    h2('2.6 Transmittals'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Types', 'Internal (within project team) and External (to client or third party)'],
        ['Content', 'Bundle multiple documents, drawings, RFIs, or submittals into a single transmittal'],
        ['Purpose codes', 'Configurable: For Approval, For Information, For Construction, For Record'],
        ['Acknowledgement', 'Recipients must acknowledge receipt; acknowledgement time-stamped and logged'],
        ['Cover sheet', 'Auto-generated PDF cover sheet with transmittal number, contents list, and recipient details'],
        ['Tracking', 'Dashboard view of all outstanding acknowledgements'],
      ],
      [3200, 6160]
    ),

    h2('2.7 Meeting Management'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Meeting types', 'Site meetings, design review, progress, safety, commissioning'],
        ['Agenda', 'Pre-meeting agenda builder; agenda items assigned to presenters'],
        ['Minutes', 'Structured minutes linked to agenda items; rich text with attachments'],
        ['Action items', 'Captured in-meeting; assigned to individuals with due dates; tracked to closure'],
        ['Attendance', 'Digital sign-off on mobile; absentee tracking'],
        ['Distribution', 'Auto-distribute draft minutes for review; final minutes distributed as PDF transmittal'],
        ['Recurrence', 'Set up recurring meetings (weekly, fortnightly) with auto-agenda generation'],
      ],
      [3200, 6160]
    ),

    h2('2.8 Snagging / Punch Lists'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Item creation', 'Web and mobile; GPS location capture; photo attachment (up to 10 per item)'],
        ['Location', 'Pin on drawing or floor plan; GPS coordinates captured on mobile'],
        ['Priority', 'Critical, High, Medium, Low; configurable'],
        ['Assignment', 'Assigned to responsible trade/subcontractor; due date mandatory'],
        ['Status', 'Open → In Progress → Ready for Inspection → Closed / Disputed'],
        ['Inspection', 'QA engineer inspects and either closes or re-opens with comments'],
        ['Export', 'PDF punch list report; Excel export for offline use'],
      ],
      [3200, 6160]
    ),

    h2('2.9 Quality Management'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['NCR (Non-Conformance Report)', 'Log non-conformances with description, photo, location, and root cause; linked to corrective action'],
        ['Inspection Requests', 'Contractor requests inspection; Engineer accepts, rejects, or marks as witnessed'],
        ['Test Requests', 'Request lab or field tests; link test results as attachments'],
        ['Checklists', 'Configurable inspection checklists with pass/fail/NA; photo evidence per item'],
        ['Observation', 'General quality or HSE observations; positive or negative classification'],
        ['Analytics', 'NCR by trade, discipline, location; open NCR ageing; first-time pass rate for inspections'],
      ],
      [3200, 6160]
    ),

    h2('2.10 Health & Safety (HSE)'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Incident reporting', 'Near miss, first aid, medical treatment, lost time, fatality; mandatory fields per severity'],
        ['RIDDOR / regulatory', 'Configurable reporting fields for regional regulatory requirements'],
        ['Safety observations', 'Positive and negative observations; photo evidence; corrective action tracking'],
        ['Toolbox talks', 'Create, distribute, and record attendance; digital sign-off on mobile'],
        ['Risk assessments', 'Structured risk register with likelihood × severity matrix; control measures'],
        ['Permit management', 'Hot work, confined space, working at height, electrical isolation permits; expiry alerts'],
        ['Statistics', 'LTIFR, TRIFR, near-miss frequency; trend charts; regulatory reportable incidents'],
      ],
      [3200, 6160]
    ),

    h2('2.11 BIM Integration'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['IFC Viewer', 'Browser-based IFC 2x3 and IFC 4 viewer; model navigation, section cuts, element properties'],
        ['Model management', 'Upload and version IFC/RVT models; federated model combining multiple disciplines'],
        ['Model linking', 'Link model elements to documents, RFIs, NCRs, and punch list items'],
        ['Clash detection integration', 'Export clash report from Navisworks; view clashes in the platform; assign for resolution'],
        ['BCF support', 'BIM Collaboration Format (BCF) import and export for issue exchange with authoring tools'],
        ['4D simulation', 'Link model elements to project schedule activities (Primavera P6 integration)'],
      ],
      [3200, 6160]
    ),

    h2('2.12 Forms'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Form builder', 'Drag-and-drop form designer; field types: text, number, date, dropdown, radio, checkbox, photo, signature, GPS, drawing markup'],
        ['Conditional logic', 'Show/hide fields based on prior answers'],
        ['Offline support', 'Forms completed offline on mobile; sync when connectivity restored'],
        ['Digital signatures', 'Draw or type signature; locked to user identity and timestamp'],
        ['PDF generation', 'Completed form exported as formatted PDF'],
        ['Analytics', 'Response aggregation and trend reporting across form submissions'],
      ],
      [3200, 6160]
    ),

    h2('2.13 Reporting & Analytics'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Project dashboard', 'Real-time overview: open items by module, upcoming milestones, team activity'],
        ['KPI dashboards', 'Configurable KPI cards: RFI response time, NCR close-out rate, submittal cycle time'],
        ['Workflow analytics', 'Average approval duration, SLA breach rate, bottleneck identification per step'],
        ['Custom reports', 'Report builder: filter, group, sort, and export any entity as PDF or Excel'],
        ['Scheduled reports', 'Auto-generate and email reports on a recurring schedule'],
        ['Data export', 'Full project data export in JSON or CSV for migration and archival'],
        ['Power BI connector', 'Live data connector for Power BI; pre-built report templates available'],
      ],
      [3200, 6160]
    ),

    h2('2.14 Mobile Application'),
    makeTable(
      ['Feature', 'Specification'],
      [
        ['Platforms', 'iOS 15+ and Android 10+; built with React Native'],
        ['Offline mode', 'Cache assigned tasks, forms, drawings, and punch list items; sync on reconnect'],
        ['Photo capture', 'Native camera integration; photos auto-compressed and geo-tagged'],
        ['GPS', 'Location capture for site observations, punch list items, and incidents'],
        ['QR / Barcode scanning', 'Scan drawing QR codes, asset tags, and material barcodes'],
        ['Push notifications', 'Real-time alerts for approvals, assignments, mentions, and SLA breaches'],
        ['Biometric auth', 'Face ID / fingerprint login; session token cached securely in device keychain'],
      ],
      [3200, 6160]
    ),

    pageBreak(),
  ];
}

// ─── Section 3: API Design ───────────────────────────────────────────────────

function apiDesign() {
  return [
    h1('3. API Design Specification'),

    h2('3.1 API Conventions'),
    makeTable(
      ['Convention', 'Detail'],
      [
        ['Base URL', 'https://api.cde.example.com/v1'],
        ['Protocol', 'HTTPS only (TLS 1.3); HTTP requests are redirected'],
        ['Versioning', 'URI versioning: /v1/, /v2/; deprecated versions supported for 12 months'],
        ['Authentication', 'Bearer token (JWT) in Authorization header; refresh via POST /auth/token/refresh'],
        ['Content-Type', 'application/json for all requests and responses'],
        ['Date format', 'ISO 8601 (UTC): 2025-06-01T12:00:00Z'],
        ['Pagination', 'Cursor-based: ?cursor=<token>&limit=50; max limit 200'],
        ['Sorting', '?sort=createdAt:desc,name:asc'],
        ['Filtering', '?filter[status]=open&filter[assigneeId]=uuid'],
        ['Field selection', '?fields=id,name,status (sparse fieldsets)'],
        ['Error format', 'RFC 7807 Problem Details: { type, title, status, detail, instance }'],
        ['Rate limiting', '1000 req/min per API key; 429 Too Many Requests with Retry-After header'],
        ['Idempotency', 'POST requests accept Idempotency-Key header; duplicate requests return cached response'],
      ],
      [3000, 6360]
    ),

    h2('3.2 Authentication & Authorization'),
    h3('POST /auth/token'),
    para('Exchange credentials or auth code for access and refresh tokens.'),
    makeTable(
      ['Field', 'Type', 'Description'],
      [
        ['grant_type', 'string', 'password | authorization_code | refresh_token | client_credentials'],
        ['client_id', 'string', 'OAuth 2.0 client identifier'],
        ['username', 'string', 'User email (password grant only)'],
        ['password', 'string', 'User password (password grant only)'],
        ['code', 'string', 'Authorization code (authorization_code grant only)'],
        ['refresh_token', 'string', 'Refresh token (refresh_token grant only)'],
      ],
      [2000, 2000, 5360]
    ),
    para('Response: { access_token, refresh_token, token_type: "Bearer", expires_in: 900, scope }'),

    h3('POST /auth/mfa/verify'),
    para('Verify TOTP code during MFA challenge. Returns final access token on success.'),

    h2('3.3 Core API Endpoints'),

    h3('Projects'),
    makeTable(
      ['Method', 'Endpoint', 'Description'],
      [
        ['GET', '/projects', 'List projects accessible to the caller'],
        ['POST', '/projects', 'Create a new project'],
        ['GET', '/projects/{projectId}', 'Get project details'],
        ['PATCH', '/projects/{projectId}', 'Update project metadata'],
        ['DELETE', '/projects/{projectId}', 'Archive (soft-delete) a project'],
        ['GET', '/projects/{projectId}/members', 'List project members and roles'],
        ['POST', '/projects/{projectId}/members', 'Add a member to the project'],
        ['GET', '/projects/{projectId}/dashboard', 'Get project dashboard summary'],
      ],
      [1200, 4000, 4160]
    ),

    h3('Documents'),
    makeTable(
      ['Method', 'Endpoint', 'Description'],
      [
        ['GET', '/projects/{projectId}/documents', 'List documents with filtering, sorting, pagination'],
        ['POST', '/projects/{projectId}/documents/upload-url', 'Request presigned S3 URL for direct upload'],
        ['POST', '/projects/{projectId}/documents', 'Register document after S3 upload completes'],
        ['GET', '/projects/{projectId}/documents/{documentId}', 'Get document metadata and revision history'],
        ['PATCH', '/projects/{projectId}/documents/{documentId}', 'Update document metadata'],
        ['POST', '/projects/{projectId}/documents/{documentId}/checkout', 'Lock document for editing'],
        ['POST', '/projects/{projectId}/documents/{documentId}/checkin', 'Upload new version and release lock'],
        ['GET', '/projects/{projectId}/documents/{documentId}/revisions', 'List all revisions'],
        ['GET', '/projects/{projectId}/documents/{documentId}/revisions/{revisionId}/download', 'Get signed download URL'],
        ['DELETE', '/projects/{projectId}/documents/{documentId}', 'Archive document'],
        ['POST', '/projects/{projectId}/documents/search', 'Full-text and faceted search'],
      ],
      [1200, 4400, 3760]
    ),

    h3('Workflows'),
    makeTable(
      ['Method', 'Endpoint', 'Description'],
      [
        ['GET', '/workflow-templates', 'List workflow templates for the organization'],
        ['POST', '/workflow-templates', 'Create a workflow template'],
        ['POST', '/projects/{projectId}/workflows', 'Start a workflow instance on a resource'],
        ['GET', '/projects/{projectId}/workflows/{workflowId}', 'Get workflow instance state and history'],
        ['POST', '/projects/{projectId}/workflows/{workflowId}/steps/{stepId}/approve', 'Approve a workflow step'],
        ['POST', '/projects/{projectId}/workflows/{workflowId}/steps/{stepId}/reject', 'Reject a workflow step'],
        ['POST', '/projects/{projectId}/workflows/{workflowId}/steps/{stepId}/delegate', 'Delegate step to another user'],
        ['GET', '/me/pending-approvals', 'List all pending approval actions for the caller'],
      ],
      [1200, 4600, 3560]
    ),

    h3('RFIs'),
    makeTable(
      ['Method', 'Endpoint', 'Description'],
      [
        ['GET', '/projects/{projectId}/rfis', 'List RFIs with filter by status, assignee, due date'],
        ['POST', '/projects/{projectId}/rfis', 'Create a new RFI'],
        ['GET', '/projects/{projectId}/rfis/{rfiId}', 'Get RFI details, attachments, and response thread'],
        ['PATCH', '/projects/{projectId}/rfis/{rfiId}', 'Update RFI (subject, description, due date)'],
        ['POST', '/projects/{projectId}/rfis/{rfiId}/respond', 'Submit a response to an RFI'],
        ['POST', '/projects/{projectId}/rfis/{rfiId}/close', 'Close an RFI'],
        ['POST', '/projects/{projectId}/rfis/{rfiId}/void', 'Void an RFI'],
      ],
      [1200, 4000, 4160]
    ),

    h3('Quality & HSE'),
    makeTable(
      ['Method', 'Endpoint', 'Description'],
      [
        ['POST', '/projects/{projectId}/ncrs', 'Log a Non-Conformance Report'],
        ['GET', '/projects/{projectId}/ncrs', 'List NCRs with filter'],
        ['PATCH', '/projects/{projectId}/ncrs/{ncrId}', 'Update NCR status and corrective action'],
        ['POST', '/projects/{projectId}/inspections', 'Create inspection request'],
        ['POST', '/projects/{projectId}/inspections/{id}/witness', 'Record inspection result (pass/fail/partial)'],
        ['POST', '/projects/{projectId}/hse/incidents', 'Report an incident or near miss'],
        ['POST', '/projects/{projectId}/hse/permits', 'Request a work permit'],
        ['PATCH', '/projects/{projectId}/hse/permits/{permitId}/approve', 'Approve a work permit'],
      ],
      [1200, 4000, 4160]
    ),

    h3('Notifications & Webhooks'),
    makeTable(
      ['Method', 'Endpoint', 'Description'],
      [
        ['GET', '/me/notifications', 'List in-app notifications for caller'],
        ['PATCH', '/me/notifications/{id}/read', 'Mark notification as read'],
        ['POST', '/organizations/{orgId}/webhooks', 'Register a webhook endpoint'],
        ['GET', '/organizations/{orgId}/webhooks', 'List registered webhooks'],
        ['DELETE', '/organizations/{orgId}/webhooks/{webhookId}', 'Delete a webhook'],
      ],
      [1200, 4000, 4160]
    ),

    h2('3.4 Webhook Event Catalog'),
    makeTable(
      ['Event', 'Trigger'],
      [
        ['document.uploaded', 'A new document or revision is uploaded'],
        ['document.approved', 'Document workflow step approved'],
        ['document.rejected', 'Document workflow step rejected'],
        ['rfi.created', 'New RFI created'],
        ['rfi.responded', 'Response submitted on an RFI'],
        ['rfi.closed', 'RFI closed'],
        ['submittal.created', 'New submittal logged'],
        ['submittal.status_changed', 'Submittal approval status updated'],
        ['ncr.created', 'New NCR logged'],
        ['incident.reported', 'New HSE incident reported'],
        ['workflow.completed', 'A workflow instance completed (approved or rejected)'],
        ['workflow.sla_breached', 'A workflow step exceeded its SLA'],
      ],
      [3600, 5760]
    ),

    h2('3.5 Standard Error Codes'),
    makeTable(
      ['HTTP Status', 'Error Code', 'Description'],
      [
        ['400', 'VALIDATION_ERROR', 'Request body failed schema validation'],
        ['401', 'UNAUTHORIZED', 'Missing or invalid bearer token'],
        ['403', 'FORBIDDEN', 'Caller lacks required permission'],
        ['404', 'NOT_FOUND', 'Resource does not exist or is not accessible'],
        ['409', 'CONFLICT', 'Optimistic lock failure or duplicate resource'],
        ['422', 'UNPROCESSABLE', 'Business rule violation (e.g., document locked by another user)'],
        ['429', 'RATE_LIMITED', 'Too many requests; see Retry-After header'],
        ['500', 'INTERNAL_ERROR', 'Unexpected server error; includes correlation ID for support'],
        ['503', 'SERVICE_UNAVAILABLE', 'Dependency temporarily unavailable; retry after backoff'],
      ],
      [1500, 2500, 5360]
    ),

    pageBreak(),
  ];
}

// ─── Section 4: Database / ERD ───────────────────────────────────────────────

function databaseSpec() {
  return [
    h1('4. Database Design & Entity Relationships'),

    h2('4.1 Design Principles'),
    bullet('Each microservice owns its own PostgreSQL schema; cross-service references use event-driven synchronization, not foreign keys across schemas.'),
    bullet('All tables include: id (UUID v4), tenant_id (UUID), created_at, updated_at, created_by, is_deleted (soft-delete flag).'),
    bullet('Row-Level Security (RLS) policies enforce tenant_id isolation at the database level.'),
    bullet('Optimistic locking via a version integer column on mutable entities.'),
    bullet('JSON/JSONB columns used sparingly for dynamic metadata fields only.'),

    h2('4.2 Core Entity Reference'),

    h3('Identity & Organization Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['tenants', 'id, name, domain, region, plan_type, status', 'Top-level tenant record for each customer organization'],
        ['organizations', 'id, tenant_id, parent_id, name, type, country', 'Company hierarchy within a tenant; self-referencing for sub-organizations'],
        ['users', 'id, tenant_id, email, display_name, avatar_url, status, mfa_enabled', 'Platform user accounts'],
        ['user_org_memberships', 'id, user_id, organization_id, role_id, joined_at', 'Links users to organizations with a role'],
        ['roles', 'id, tenant_id, name, is_system, permissions (jsonb)', 'Named permission sets; is_system roles cannot be deleted'],
        ['sso_configurations', 'id, tenant_id, provider (saml|oidc), metadata_url, client_id, enabled', 'SSO connection per tenant'],
        ['sessions', 'id, user_id, refresh_token_hash, ip, user_agent, expires_at', 'Active user sessions'],
        ['audit_logs', 'id, tenant_id, user_id, action, resource_type, resource_id, changes (jsonb), ip, timestamp', 'Immutable audit trail'],
      ],
      [2400, 3600, 3360]
    ),

    h3('Project Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['projects', 'id, tenant_id, name, code, status, start_date, end_date, template_id, owner_org_id', 'Core project record'],
        ['project_members', 'id, project_id, user_id, organization_id, role_id, invited_by, accepted_at', 'Project team membership'],
        ['project_milestones', 'id, project_id, name, due_date, status, linked_activity_id', 'Key project dates and gates'],
        ['project_templates', 'id, tenant_id, name, folder_structure (jsonb), workflow_templates (jsonb)', 'Reusable project configuration templates'],
        ['project_calendars', 'id, project_id, name, working_days (jsonb), exceptions (jsonb)', 'Working calendar for SLA calculations'],
      ],
      [2400, 3600, 3360]
    ),

    h3('Document Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['folders', 'id, project_id, parent_id, name, path, permission_override (jsonb)', 'Hierarchical folder structure; path is materialized for efficient subtree queries'],
        ['documents', 'id, project_id, folder_id, title, doc_number, type, status, current_revision_id, locked_by, locked_at', 'Document master record'],
        ['document_revisions', 'id, document_id, revision_number, revision_label, file_key (S3), file_size, mime_type, checksum, uploader_id, status, ocr_text', 'Immutable revision record per upload'],
        ['document_metadata', 'id, document_id, revision_id, key, value, data_type', 'Key-value metadata; allows custom fields per document type'],
        ['document_tags', 'id, document_id, tag', 'Many-to-many document-to-tag'],
        ['document_permissions', 'id, document_id, principal_type (user|role|org), principal_id, permissions (jsonb)', 'Document-level permission overrides'],
      ],
      [2400, 3600, 3360]
    ),

    h3('Workflow Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['workflow_templates', 'id, tenant_id, name, module, steps (jsonb)', 'Reusable workflow definition; steps stored as ordered JSON array'],
        ['workflow_instances', 'id, project_id, template_id, resource_type, resource_id, status, started_at, completed_at', 'Running workflow against a specific resource'],
        ['workflow_steps', 'id, instance_id, step_number, step_type, assignee_type, assignee_id, status, due_date, sla_hours, actioned_at, actioned_by, comment', 'Individual step state within a running workflow'],
        ['workflow_escalations', 'id, step_id, escalated_to_id, escalated_at, reason', 'Escalation history when SLA breached'],
      ],
      [2400, 3600, 3360]
    ),

    h3('RFI Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['rfis', 'id, project_id, rfi_number, subject, description, status, priority, assignee_id, assignee_org_id, due_date, closed_at, drawing_id, bim_element_id', 'RFI master record'],
        ['rfi_responses', 'id, rfi_id, author_id, body, response_type (response|clarification|close), created_at', 'Threaded response entries'],
        ['rfi_attachments', 'id, rfi_id, response_id, file_key, filename, file_size, mime_type, uploaded_by', 'Files attached to RFIs or responses'],
      ],
      [2400, 3600, 3360]
    ),

    h3('Submittals Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['submittals', 'id, project_id, submittal_number, title, type, spec_section, status, responsible_party_id, required_date', 'Submittal register entry'],
        ['submittal_revisions', 'id, submittal_id, revision_number, submitted_by, submitted_at, files (jsonb), notes', 'Each formal resubmission'],
        ['submittal_reviews', 'id, submittal_revision_id, reviewer_id, action (approved|approved_as_noted|revise|rejected), comment, actioned_at', 'Review decision per revision'],
      ],
      [2400, 3600, 3360]
    ),

    h3('Quality & HSE Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['ncrs', 'id, project_id, ncr_number, title, description, location, raised_by, assigned_to_org_id, status, severity, root_cause, corrective_action, closed_at', 'Non-Conformance Report'],
        ['inspections', 'id, project_id, type, title, location, drawing_id, requested_by, witness_id, scheduled_date, result (pass|fail|partial), completed_at', 'Inspection request and result'],
        ['checklists', 'id, project_id, template_id, inspection_id, completed_by, items (jsonb), completed_at', 'Checklist responses; items array holds field name, type, response, and evidence'],
        ['hse_incidents', 'id, project_id, incident_number, type, severity, date_occurred, location, description, injured_person, days_lost, reported_by, status', 'HSE incident record'],
        ['permits', 'id, project_id, permit_number, type, description, location, issued_to_id, valid_from, valid_until, approved_by, status', 'Work permit record'],
        ['safety_observations', 'id, project_id, type (positive|negative), description, location, photo_keys (jsonb), raised_by, assigned_to, status', 'Site safety observation'],
      ],
      [2400, 3600, 3360]
    ),

    h3('Asset Schema'),
    makeTable(
      ['Table', 'Key Columns', 'Description'],
      [
        ['assets', 'id, project_id, asset_number, name, category, classification, location, serial_number, manufacturer, model, install_date, warranty_expiry, status', 'Asset register entry'],
        ['asset_documents', 'id, asset_id, document_id, doc_type (manual|warranty|certificate)', 'Links documents to assets'],
        ['asset_maintenance', 'id, asset_id, type, scheduled_date, completed_date, performed_by, notes', 'Maintenance event log'],
      ],
      [2400, 3600, 3360]
    ),

    h2('4.3 Key Relationships Summary'),
    makeTable(
      ['Relationship', 'Cardinality', 'Notes'],
      [
        ['Tenant → Organizations', '1 : N', 'Organizations form a tree within a tenant'],
        ['Organization → Users', 'N : M', 'Via user_org_memberships join table'],
        ['Project → Members', 'N : M', 'Via project_members; user has one role per project'],
        ['Folder → Documents', '1 : N', 'Documents belong to exactly one folder'],
        ['Document → Revisions', '1 : N', 'Immutable revisions; current_revision_id points to latest'],
        ['Document → Workflow', '1 : 0..1', 'A document may have at most one active workflow instance'],
        ['Workflow Template → Instances', '1 : N', 'Many instances of the same template across projects'],
        ['RFI → Attachments', '1 : N', 'Multiple files per RFI or per response'],
        ['Submittal → Revisions → Reviews', '1 : N : N', 'Each submittal revision can have multiple reviewer decisions'],
        ['NCR → Inspection', 'N : M', 'NCRs may trigger inspections; inspections may spawn NCRs'],
        ['Asset → Documents', 'N : M', 'Via asset_documents; O&M manuals, warranties linked to assets'],
      ],
      [3000, 1800, 4560]
    ),

    h2('4.4 Indexing Strategy'),
    makeTable(
      ['Table', 'Index', 'Rationale'],
      [
        ['documents', '(project_id, folder_id, is_deleted)', 'Primary listing query filter'],
        ['documents', '(tenant_id, doc_number)', 'Document number uniqueness and lookup'],
        ['document_revisions', '(document_id, revision_number DESC)', 'Latest revision fetch'],
        ['workflow_steps', '(assignee_id, status, due_date)', 'Pending approvals dashboard'],
        ['rfis', '(project_id, status, due_date)', 'RFI tracking views'],
        ['audit_logs', '(tenant_id, resource_type, resource_id, timestamp DESC)', 'Audit trail queries'],
        ['hse_incidents', '(project_id, date_occurred DESC)', 'Incident reporting timelines'],
        ['document_revisions', 'GIN index on ocr_text (tsvector)', 'Full-text search within PostgreSQL (supplemented by Elasticsearch)'],
      ],
      [2400, 3600, 3360]
    ),

    pageBreak(),
  ];
}

// ─── Build Document ───────────────────────────────────────────────────────────

const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }, {
        level: 1,
        format: LevelFormat.BULLET,
        text: '◦',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
      }],
    },
  ],
};

const styles = {
  default: {
    document: { run: { font: 'Arial', size: 22 } },
  },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 36, bold: true, font: 'Arial', color: COLORS.headerBg },
      paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 28, bold: true, font: 'Arial', color: COLORS.accent },
      paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 },
    },
    {
      id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 24, bold: true, font: 'Arial', color: '333333' },
      paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 },
    },
  ],
};

const tocSection = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, font: 'Arial', color: COLORS.headerBg })],
  }),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  pageBreak(),
];

const allChildren = [
  ...coverPage(),
  ...tocSection,
  ...systemArchitecture(),
  ...moduleSpecs(),
  ...apiDesign(),
  ...databaseSpec(),
];

const doc = new Document({
  numbering,
  styles,
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.accent, space: 1 } },
          children: [
            new TextRun({ text: 'CDE & Construction Collaboration Platform — Technical Specification', size: 18, font: 'Arial', color: '555555' }),
            new TextRun({ text: '\t', size: 18 }),
            new TextRun({ text: 'v1.0  |  CONFIDENTIAL', size: 18, font: 'Arial', color: '555555', bold: true }),
          ],
          tabStops: [{ type: 'right', position: 9360 }],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.accent, space: 1 } },
          children: [
            new TextRun({ text: '© 2025 Enterprise CDE Platform. All rights reserved.', size: 18, font: 'Arial', color: '777777' }),
            new TextRun({ text: '\tPage ', size: 18, font: 'Arial', color: '777777' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '777777' }),
            new TextRun({ text: ' of ', size: 18, font: 'Arial', color: '777777' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Arial', color: '777777' }),
          ],
          tabStops: [{ type: 'right', position: 9360 }],
        })],
      }),
    },
    children: allChildren,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/sessions/sleepy-eager-bardeen/mnt/outputs/CDE_Technical_Specification_v1.0.docx', buffer);
  console.log('Done: CDE_Technical_Specification_v1.0.docx');
});
