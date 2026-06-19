"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Button, Card, CardBody, Textarea } from "@/components/ui";
import {
  createNoteAction,
  deleteNoteAction,
  updateNoteAction,
} from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

export interface NoteItemData {
  id: string;
  body: string;
  createdAt: Date;
}

/** Add-note form: uncontrolled textarea reset on success via `form.reset()`. */
function AddNoteForm({ leadId }: { leadId: string }) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(createNoteAction, initialState);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leadId" value={leadId} />

      {state.status === "error" && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}

      <Textarea
        label={t("notes.add")}
        name="body"
        placeholder={t("notes.placeholder")}
        error={
          state.status === "error" && state.fieldErrors?.body
            ? tm(state.fieldErrors.body)
            : undefined
        }
      />
      {/* Inline save: small, auto-width, right-aligned (audit P1.2). */}
      <div className="flex justify-end">
        <SubmitButton size="sm" className="w-auto" pendingLabel={t("leads.saving")}>
          {t("notes.save")}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Single note: read view with edit/delete; edit toggles an inline update form. */
function NoteItem({ note, dateText }: { note: NoteItemData; dateText: string }) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateNoteAction, initialState);
  const [, deleteAction] = useActionState(deleteNoteAction, initialState);

  // Leave edit mode on the success transition (render-time state adjustment,
  // React's "store info from previous renders" pattern — conditional, converges).
  const [seenStatus, setSeenStatus] = useState(editState.status);
  if (seenStatus !== editState.status) {
    setSeenStatus(editState.status);
    if (editState.status === "success") setEditing(false);
  }

  return (
    <li className="border-line flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      {editing ? (
        <form action={editAction} noValidate className="flex flex-col gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="noteId" value={note.id} />

          {editState.status === "error" && editState.formError ? (
            <FormAlert tone="error">{tm(editState.formError)}</FormAlert>
          ) : null}

          <Textarea
            label={t("notes.edit")}
            hideLabel
            name="body"
            defaultValue={note.body}
            error={
              editState.status === "error" && editState.fieldErrors?.body
                ? tm(editState.fieldErrors.body)
                : undefined
            }
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel={t("leads.saving")} className="w-auto">
              {t("notes.save")}
            </SubmitButton>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t("notes.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="font-body text-ink text-[13.5px] whitespace-pre-wrap">{note.body}</p>
          <p className="label-mono text-muted">{dateText}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`${t("notes.edit")} — ${dateText}`}
            >
              {t("notes.edit")}
            </Button>
            <form action={deleteAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="noteId" value={note.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                aria-label={`${t("notes.deleteLabel")} — ${dateText}`}
              >
                {t("notes.deleteLabel")}
              </Button>
            </form>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * Notes panel (docs/02 §2.4). Add (when `canNote`), list most-recent-first,
 * inline edit + delete per note. All controls are real buttons/forms so they
 * stay keyboard operable; dates are localized client-side via `useFormatter`.
 */
export function NotesPanel({
  leadId,
  notes,
  canNote,
}: {
  leadId: string;
  notes: readonly NoteItemData[];
  canNote: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("notes.title")}</h2>

        {canNote ? <AddNoteForm leadId={leadId} /> : null}

        {notes.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("notes.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) =>
              canNote ? (
                <NoteItem
                  key={note.id}
                  note={note}
                  dateText={format.dateTime(note.createdAt, "short")}
                />
              ) : (
                <li
                  key={note.id}
                  className="border-line flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="font-body text-ink text-[13.5px] whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <p className="label-mono text-muted">
                    {format.dateTime(note.createdAt, "short")}
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
