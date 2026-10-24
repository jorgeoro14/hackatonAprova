import { z } from "zod";

/** Evidence transport shared by the canonical form and its frontend reader. */
export const LegalEvidenceRecord = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  municipalityId: z.string().min(1),
  article: z.string().min(1),
  excerpt: z.string().min(1),
  sourceUrl: z.url(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  effectiveStatus: z.enum(["confirmed", "unverified", "revoked"]),
  applicability: z.enum(["confirmed", "conditional", "unverified"]),
  retrievedAt: z.string().min(1),
});

export const RequirementCitation = z.object({
  /** Path relative to processo; evidence supports a proposal, not automatic approval. */
  caminho: z.string().min(1),
  evidenceId: z.string().min(1),
  quote: z.string().min(1),
  requirement: z.string().min(1),
  validation: z.literal("pending_human_review"),
});

export const FieldDifference = z.object({
  fieldId: z.string().min(1),
  action: z.enum(["add_field", "update_field", "remove_field"]),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});

/** Human authorization is revision-bound and never supplied by the model. */
export const ImplementerApprovalRequest = z.object({
  revision: z.number().int().positive(),
  text: z.string().trim().min(1).max(4000),
  approve: z.literal(true),
});

export const ImplementerApprovalHistory = z.object({
  revision: z.number().int().positive(),
  approved: z.boolean(),
  items: z.array(z.object({
    id: z.string(), revision: z.number().int().positive(), text: z.string(),
    digest: z.string(), approvedAt: z.string(), actorId: z.string(), actorName: z.string(),
  })),
});
