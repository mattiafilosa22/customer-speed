import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { createNote, deleteNote, updateNote } from "@/server/leads/notes";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("notes", () => {
  it("creates a note on a tenant lead, stamping the author (happy path)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const { id } = await createNote(deps, lead.id, { body: "Prima nota" });
    expect(id).toBeTruthy();
    expect(store.notes[0]).toMatchObject({
      leadId: lead.id,
      authorId: USER_A,
      organizationId: ORG_A,
      body: "Prima nota",
    });
  });

  it("rejects an empty note body (ValidationError)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(createNote(deps, lead.id, { body: "   " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("cannot add a note to a lead in another tenant (cross-tenant → 404)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(createNote(deps, otherLead.id, { body: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(store.notes).toHaveLength(0);
  });

  it("updates a note in the tenant", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const note = store.addNote({ organizationId: ORG_A, leadId: lead.id, body: "old" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateNote(deps, note.id, { body: "new" });
    expect(store.notes[0]?.body).toBe("new");
  });

  it("cannot update a note in another tenant (404)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const otherNote = store.addNote({ organizationId: ORG_B, leadId: otherLead.id, body: "x" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(updateNote(deps, otherNote.id, { body: "hacked" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(store.notes[0]?.body).toBe("x");
  });

  it("deletes a note in the tenant", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const note = store.addNote({ organizationId: ORG_A, leadId: lead.id });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await deleteNote(deps, note.id);
    expect(store.notes).toHaveLength(0);
  });

  it("cannot delete a note in another tenant (404)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const otherNote = store.addNote({ organizationId: ORG_B, leadId: otherLead.id });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(deleteNote(deps, otherNote.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(store.notes).toHaveLength(1);
  });
});
