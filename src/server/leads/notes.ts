import { parseInput } from "@/server/validation";
import type { LeadDeps } from "@/server/leads/deps";
import { createNoteSchema, updateNoteSchema } from "@/server/leads/schemas";
import { assertLeadBelongsToTenant, getOwnedNoteLeadId } from "@/server/leads/ownership";

/**
 * Note CRUD for a lead (docs/02 §2.5, docs/04 §4.4). Capability `lead.note` is
 * checked by the caller layer; `authorId` comes from the server-resolved actor.
 *
 * Tenant + lead ownership are enforced on every operation through the scoped
 * client (the note write also stamps `organizationId` via the extension), and a
 * cross-tenant lead/note id is reported as 404.
 */

/** List a lead's notes (most recent first) — REST read for docs/04 §4.4 GET. */
export async function listNotes(
  deps: LeadDeps,
  leadId: string,
): Promise<Array<{ id: string; body: string; authorId: string | null; createdAt: Date }>> {
  // Scoped read asserts the lead is in the tenant (404 otherwise).
  await assertLeadBelongsToTenant(deps, leadId);
  return deps.prisma.note.findMany({
    where: { leadId },
    select: { id: true, body: true, authorId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createNote(
  deps: LeadDeps,
  leadId: string,
  input: unknown,
): Promise<{ id: string }> {
  const data = parseInput(createNoteSchema, input);
  await assertLeadBelongsToTenant(deps, leadId);

  const note = await deps.prisma.note.create({
    // organizationId explicit for the static type; injected (same value) at runtime.
    data: {
      organizationId: deps.actor.organizationId,
      leadId,
      authorId: deps.actor.userId,
      body: data.body,
    },
    select: { id: true },
  });

  await deps.audit.record({
    action: "note.create",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Note",
    entityId: note.id,
    meta: { leadId },
  });

  return note;
}

export async function updateNote(
  deps: LeadDeps,
  noteId: string,
  input: unknown,
): Promise<{ id: string; leadId: string }> {
  const data = parseInput(updateNoteSchema, input);
  // 404 if the note is missing / in another tenant.
  const leadId = await getOwnedNoteLeadId(deps, noteId);

  await deps.prisma.note.update({
    where: { id: noteId },
    data: { body: data.body },
  });

  await deps.audit.record({
    action: "note.update",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Note",
    entityId: noteId,
    meta: { leadId },
  });

  return { id: noteId, leadId };
}

export async function deleteNote(
  deps: LeadDeps,
  noteId: string,
): Promise<{ id: string; leadId: string }> {
  const leadId = await getOwnedNoteLeadId(deps, noteId);

  await deps.prisma.note.delete({ where: { id: noteId } });

  await deps.audit.record({
    action: "note.delete",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Note",
    entityId: noteId,
    meta: { leadId },
  });

  return { id: noteId, leadId };
}
