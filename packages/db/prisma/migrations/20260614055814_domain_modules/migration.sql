-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '/',
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "folder_id" UUID,
    "title" TEXT NOT NULL,
    "doc_number" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "current_revision_id" UUID,
    "locked_by" UUID,
    "locked_at" TIMESTAMP(3),
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "revision_label" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "checksum" TEXT,
    "uploader_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "ocr_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tags" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "drawing_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "scale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "current_revision" TEXT,
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_revisions" (
    "id" UUID NOT NULL,
    "drawing_id" UUID NOT NULL,
    "revision_label" TEXT NOT NULL,
    "file_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'current',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'document',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "template_id" UUID,
    "name" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "step_type" TEXT NOT NULL DEFAULT 'approval',
    "assignee_type" TEXT NOT NULL DEFAULT 'user',
    "assignee_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMP(3),
    "sla_hours" INTEGER,
    "actioned_at" TIMESTAMP(3),
    "actioned_by" UUID,
    "comment" TEXT,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfis" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rfi_number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignee_id" UUID,
    "assignee_org_id" UUID,
    "due_date" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "drawing_id" UUID,
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfi_responses" (
    "id" UUID NOT NULL,
    "rfi_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "response_type" TEXT NOT NULL DEFAULT 'response',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfi_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfi_attachments" (
    "id" UUID NOT NULL,
    "rfi_id" UUID NOT NULL,
    "response_id" UUID,
    "file_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfi_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submittals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "submittal_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'material',
    "spec_section" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "responsible_party_id" UUID,
    "required_date" TIMESTAMP(3),
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submittals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submittal_revisions" (
    "id" UUID NOT NULL,
    "submittal_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "submittal_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submittal_reviews" (
    "id" UUID NOT NULL,
    "submittal_revision_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actioned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submittal_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "transmittal_number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'internal',
    "purpose" TEXT NOT NULL DEFAULT 'for_information',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sent_by" UUID,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transmittals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittal_items" (
    "id" UUID NOT NULL,
    "transmittal_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "label" TEXT,

    CONSTRAINT "transmittal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittal_recipients" (
    "id" UUID NOT NULL,
    "transmittal_id" UUID NOT NULL,
    "user_id" UUID,
    "organization_id" UUID,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "transmittal_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'site',
    "scheduled_at" TIMESTAMP(3),
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_items" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'agenda',
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "presenter" TEXT,

    CONSTRAINT "meeting_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_action_items" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "assignee_id" UUID,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "meeting_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendees" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMP(3),

    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snags" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "snag_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigned_to_org_id" UUID,
    "due_date" TIMESTAMP(3),
    "drawing_id" UUID,
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,
    "created_by" UUID,
    "closed_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snag_photos" (
    "id" UUID NOT NULL,
    "snag_id" UUID NOT NULL,
    "file_key" TEXT NOT NULL,
    "caption" TEXT,

    CONSTRAINT "snag_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncrs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "ncr_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "status" TEXT NOT NULL DEFAULT 'open',
    "root_cause" TEXT,
    "corrective_action" TEXT,
    "raised_by" UUID,
    "assigned_to_org_id" UUID,
    "closed_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "result" TEXT,
    "requested_by" UUID,
    "witness_id" UUID,
    "scheduled_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "template_id" UUID,
    "inspection_id" UUID,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hse_incidents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "incident_number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'near_miss',
    "severity" TEXT NOT NULL DEFAULT 'low',
    "date_occurred" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "description" TEXT,
    "injured_person" TEXT,
    "days_lost" INTEGER NOT NULL DEFAULT 0,
    "reported_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hse_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "permit_number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "location" TEXT,
    "issued_to_id" UUID,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "approved_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_observations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'negative',
    "description" TEXT NOT NULL,
    "location" TEXT,
    "raised_by" UUID,
    "assigned_to" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "classification" TEXT,
    "location" TEXT,
    "serial_number" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "install_date" TIMESTAMP(3),
    "warranty_expiry" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignee_id" UUID,
    "due_date" TIMESTAMP(3),
    "created_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "resource_type" TEXT,
    "resource_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_tenant_id_project_id_parent_id_is_deleted_idx" ON "folders"("tenant_id", "project_id", "parent_id", "is_deleted");

-- CreateIndex
CREATE INDEX "documents_tenant_id_project_id_folder_id_is_deleted_idx" ON "documents"("tenant_id", "project_id", "folder_id", "is_deleted");

-- CreateIndex
CREATE INDEX "documents_tenant_id_doc_number_idx" ON "documents"("tenant_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_revisions_document_id_revision_number_key" ON "document_revisions"("document_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_tags_document_id_tag_key" ON "document_tags"("document_id", "tag");

-- CreateIndex
CREATE INDEX "drawings_tenant_id_project_id_is_deleted_idx" ON "drawings"("tenant_id", "project_id", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_tenant_id_name_key" ON "workflow_templates"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "workflow_instances_tenant_id_project_id_status_idx" ON "workflow_instances"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "workflow_steps_assignee_id_status_due_date_idx" ON "workflow_steps"("assignee_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "rfis_tenant_id_project_id_status_due_date_idx" ON "rfis"("tenant_id", "project_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "rfis_tenant_id_project_id_rfi_number_key" ON "rfis"("tenant_id", "project_id", "rfi_number");

-- CreateIndex
CREATE INDEX "submittals_tenant_id_project_id_status_idx" ON "submittals"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "submittals_tenant_id_project_id_submittal_number_key" ON "submittals"("tenant_id", "project_id", "submittal_number");

-- CreateIndex
CREATE UNIQUE INDEX "submittal_revisions_submittal_id_revision_number_key" ON "submittal_revisions"("submittal_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "transmittals_tenant_id_project_id_transmittal_number_key" ON "transmittals"("tenant_id", "project_id", "transmittal_number");

-- CreateIndex
CREATE INDEX "meetings_tenant_id_project_id_status_idx" ON "meetings"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "snags_tenant_id_project_id_status_priority_idx" ON "snags"("tenant_id", "project_id", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "snags_tenant_id_project_id_snag_number_key" ON "snags"("tenant_id", "project_id", "snag_number");

-- CreateIndex
CREATE INDEX "ncrs_tenant_id_project_id_status_idx" ON "ncrs"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ncrs_tenant_id_project_id_ncr_number_key" ON "ncrs"("tenant_id", "project_id", "ncr_number");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_status_idx" ON "inspections"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "hse_incidents_tenant_id_project_id_date_occurred_idx" ON "hse_incidents"("tenant_id", "project_id", "date_occurred");

-- CreateIndex
CREATE UNIQUE INDEX "hse_incidents_tenant_id_project_id_incident_number_key" ON "hse_incidents"("tenant_id", "project_id", "incident_number");

-- CreateIndex
CREATE INDEX "permits_tenant_id_project_id_status_idx" ON "permits"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "permits_tenant_id_project_id_permit_number_key" ON "permits"("tenant_id", "project_id", "permit_number");

-- CreateIndex
CREATE INDEX "safety_observations_tenant_id_project_id_status_idx" ON "safety_observations"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "assets_tenant_id_project_id_status_idx" ON "assets"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenant_id_project_id_asset_number_key" ON "assets"("tenant_id", "project_id", "asset_number");

-- CreateIndex
CREATE INDEX "form_submissions_tenant_id_project_id_idx" ON "form_submissions"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_assignee_id_status_idx" ON "tasks"("tenant_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revisions" ADD CONSTRAINT "drawing_revisions_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi_responses" ADD CONSTRAINT "rfi_responses_rfi_id_fkey" FOREIGN KEY ("rfi_id") REFERENCES "rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfi_attachments" ADD CONSTRAINT "rfi_attachments_rfi_id_fkey" FOREIGN KEY ("rfi_id") REFERENCES "rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal_revisions" ADD CONSTRAINT "submittal_revisions_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "submittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submittal_reviews" ADD CONSTRAINT "submittal_reviews_submittal_revision_id_fkey" FOREIGN KEY ("submittal_revision_id") REFERENCES "submittal_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittal_items" ADD CONSTRAINT "transmittal_items_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittal_recipients" ADD CONSTRAINT "transmittal_recipients_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snag_photos" ADD CONSTRAINT "snag_photos_snag_id_fkey" FOREIGN KEY ("snag_id") REFERENCES "snags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
