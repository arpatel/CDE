import { z } from "zod";
import type { CrudConfig } from "../../lib/crud.js";

const priority = z.enum(["low", "medium", "high", "critical"]);
const isoDate = z.coerce.date();

// Per-module create schemas. Update schemas are derived as .partial().
// Numbers (rfiNumber, etc.) are auto-generated, so they are optional on input.

const documents = z.object({
  title: z.string().min(1).max(240),
  folderId: z.string().uuid().optional(),
  docNumber: z.string().max(80).optional(),
  type: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
});

const drawings = z.object({
  title: z.string().min(1).max(240),
  drawingNumber: z.string().max(80).optional(),
  discipline: z.string().max(60).optional(),
  scale: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
});

const rfis = z.object({
  subject: z.string().min(1).max(240),
  description: z.string().optional(),
  discipline: z.string().max(60).optional(),
  priority: priority.optional(),
  assigneeId: z.string().uuid().optional(),
  assigneeOrgId: z.string().uuid().optional(),
  dueDate: isoDate.optional(),
  drawingId: z.string().uuid().optional(),
  rfiNumber: z.string().optional(),
});

const submittals = z.object({
  title: z.string().min(1).max(240),
  type: z.string().max(40).optional(),
  specSection: z.string().max(80).optional(),
  responsiblePartyId: z.string().uuid().optional(),
  requiredDate: isoDate.optional(),
  submittalNumber: z.string().optional(),
});

const transmittals = z.object({
  type: z.enum(["internal", "external"]).optional(),
  purpose: z.string().max(60).optional(),
  status: z.string().max(40).optional(),
  transmittalNumber: z.string().optional(),
});

const meetings = z.object({
  title: z.string().min(1).max(240),
  type: z.string().max(40).optional(),
  scheduledAt: isoDate.optional(),
  location: z.string().max(160).optional(),
  status: z.string().max(40).optional(),
});

const snags = z.object({
  title: z.string().min(1).max(240),
  description: z.string().optional(),
  location: z.string().max(160).optional(),
  priority: priority.optional(),
  status: z.string().max(40).optional(),
  assignedToOrgId: z.string().uuid().optional(),
  dueDate: isoDate.optional(),
  drawingId: z.string().uuid().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  snagNumber: z.string().optional(),
});

const ncrs = z.object({
  title: z.string().min(1).max(240),
  description: z.string().optional(),
  location: z.string().max(160).optional(),
  severity: z.enum(["minor", "major", "critical"]).optional(),
  status: z.string().max(40).optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  assignedToOrgId: z.string().uuid().optional(),
  ncrNumber: z.string().optional(),
});

const inspections = z.object({
  title: z.string().min(1).max(240),
  type: z.string().max(40).optional(),
  location: z.string().max(160).optional(),
  status: z.string().max(40).optional(),
  result: z.string().max(40).optional(),
  witnessId: z.string().uuid().optional(),
  scheduledDate: isoDate.optional(),
});

const checklists = z.object({
  name: z.string().min(1).max(160),
  templateId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  items: z.array(z.any()).optional(),
});

const hseIncidents = z.object({
  type: z.string().max(40).optional(),
  severity: z.string().max(40).optional(),
  dateOccurred: isoDate.optional(),
  location: z.string().max(160).optional(),
  description: z.string().optional(),
  injuredPerson: z.string().max(160).optional(),
  daysLost: z.number().int().min(0).optional(),
  status: z.string().max(40).optional(),
  incidentNumber: z.string().optional(),
});

const permits = z.object({
  type: z.string().max(40).optional(),
  description: z.string().optional(),
  location: z.string().max(160).optional(),
  issuedToId: z.string().uuid().optional(),
  validFrom: isoDate.optional(),
  validUntil: isoDate.optional(),
  status: z.string().max(40).optional(),
  permitNumber: z.string().optional(),
});

const safetyObservations = z.object({
  description: z.string().min(1),
  type: z.enum(["positive", "negative"]).optional(),
  location: z.string().max(160).optional(),
  assignedTo: z.string().uuid().optional(),
  status: z.string().max(40).optional(),
});

const assets = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(80).optional(),
  classification: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  serialNumber: z.string().max(120).optional(),
  manufacturer: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  installDate: isoDate.optional(),
  warrantyExpiry: isoDate.optional(),
  status: z.string().max(40).optional(),
  assetNumber: z.string().optional(),
});

const formTemplates = z.object({
  name: z.string().min(1).max(160),
  schema: z.record(z.any()).optional(),
});

const formSubmissions = z.object({
  templateId: z.string().uuid(),
  data: z.record(z.any()).optional(),
  status: z.string().max(40).optional(),
});

const attributeSets = z.object({
  name: z.string().min(1).max(160),
  isDefault: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  hierarchy: z.enum(["project", "folder"]).optional(),
  locations: z.array(z.string().uuid()).optional(),
});

const configurableAttributes = z.object({
  name: z.string().min(1).max(160),
  controlType: z.enum(["text", "textarea", "number", "date", "dropdown", "multiselect", "radio", "checkbox"]),
  mandatory: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  options: z.array(z.string().min(1).max(160)).optional(),
  defaultValue: z.string().max(400).optional(),
  setId: z.string().uuid().optional(),
});

const tasks = z.object({
  title: z.string().min(1).max(240),
  description: z.string().optional(),
  status: z.string().max(40).optional(),
  priority: priority.optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: isoDate.optional(),
});

type ModuleDef = Omit<CrudConfig, "createSchema" | "updateSchema"> & {
  createSchema: z.AnyZodObject;
};

function def(d: ModuleDef): CrudConfig {
  return { ...d, updateSchema: d.createSchema.partial() };
}

// The full domain module catalogue driven through the generic CRUD factory.
export const DOMAIN_MODULES: CrudConfig[] = [
  def({ plural: "documents", delegate: "document", permission: "document", resourceType: "document", numbering: { field: "docNumber", prefix: "DOC" }, filterable: ["status", "folderId", "type"], createSchema: documents }),
  def({ plural: "drawings", delegate: "drawing", permission: "drawing", resourceType: "drawing", numbering: { field: "drawingNumber", prefix: "DWG" }, filterable: ["status", "discipline"], createSchema: drawings }),
  def({ plural: "rfis", delegate: "rfi", permission: "rfi", resourceType: "rfi", numbering: { field: "rfiNumber", prefix: "RFI" }, filterable: ["status", "priority", "assigneeId"], createSchema: rfis }),
  def({ plural: "submittals", delegate: "submittal", permission: "submittal", resourceType: "submittal", numbering: { field: "submittalNumber", prefix: "SUB" }, filterable: ["status", "type"], createSchema: submittals }),
  def({ plural: "transmittals", delegate: "transmittal", permission: "transmittal", resourceType: "transmittal", numbering: { field: "transmittalNumber", prefix: "TR" }, softDelete: false, createdByField: null, filterable: ["status", "type"], createSchema: transmittals }),
  def({ plural: "meetings", delegate: "meeting", permission: "meeting", resourceType: "meeting", softDelete: false, filterable: ["status", "type"], createSchema: meetings }),
  def({ plural: "snags", delegate: "snag", permission: "snag", resourceType: "snag", numbering: { field: "snagNumber", prefix: "SNG" }, filterable: ["status", "priority"], createSchema: snags }),
  def({ plural: "ncrs", delegate: "ncr", permission: "ncr", resourceType: "ncr", numbering: { field: "ncrNumber", prefix: "NCR" }, createdByField: "raisedBy", filterable: ["status", "severity"], createSchema: ncrs }),
  def({ plural: "inspections", delegate: "inspection", permission: "inspection", resourceType: "inspection", softDelete: false, createdByField: "requestedBy", filterable: ["status", "type"], createSchema: inspections }),
  def({ plural: "checklists", delegate: "checklist", permission: "quality", resourceType: "checklist", softDelete: false, createdByField: null, createSchema: checklists }),
  def({ plural: "hse-incidents", delegate: "hseIncident", permission: "hse", resourceType: "hse_incident", numbering: { field: "incidentNumber", prefix: "INC" }, createdByField: "reportedBy", filterable: ["status", "type", "severity"], createSchema: hseIncidents }),
  def({ plural: "permits", delegate: "permit", permission: "permit", resourceType: "permit", numbering: { field: "permitNumber", prefix: "PMT" }, softDelete: false, createdByField: null, filterable: ["status", "type"], createSchema: permits }),
  def({ plural: "safety-observations", delegate: "safetyObservation", permission: "hse", resourceType: "safety_observation", softDelete: false, createdByField: "raisedBy", filterable: ["status", "type"], createSchema: safetyObservations }),
  def({ plural: "assets", delegate: "asset", permission: "asset", resourceType: "asset", numbering: { field: "assetNumber", prefix: "AST" }, createdByField: null, filterable: ["status", "category"], createSchema: assets }),
  def({ plural: "form-templates", delegate: "formTemplate", permission: "form", resourceType: "form_template", createSchema: formTemplates }),
  def({ plural: "form-submissions", delegate: "formSubmission", permission: "form", resourceType: "form_submission", softDelete: false, createdByField: "submittedBy", filterable: ["status", "templateId"], createSchema: formSubmissions }),
  def({ plural: "tasks", delegate: "task", permission: "task", resourceType: "task", filterable: ["status", "priority", "assigneeId"], createSchema: tasks }),
  def({ plural: "attribute-sets", delegate: "attributeSet", permission: "attribute", resourceType: "attribute_set", filterable: ["status", "hierarchy"], include: { attributes: { select: { id: true, name: true, controlType: true, mandatory: true, status: true } } }, createSchema: attributeSets }),
  def({ plural: "attributes", delegate: "configurableAttribute", permission: "attribute", resourceType: "attribute", filterable: ["status", "setId", "controlType"], include: { set: { select: { id: true, name: true } } }, createSchema: configurableAttributes }),
];
