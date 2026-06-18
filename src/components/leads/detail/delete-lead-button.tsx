"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, Modal } from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import { deleteLeadAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * Delete-lead button (docs/02 §2.4). Opens a confirm dialog; on success the
 * lead no longer exists, so we navigate back to the list rather than leaving a
 * stale (404) detail page open.
 */
export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteLeadAction, initialState);

  // Close the dialog on the success transition (render-time state adjustment,
  // React's "store info from previous renders" pattern — conditional, converges).
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success") setOpen(false);
  }

  // Navigation is an external-system side effect (not setState), so it belongs
  // in an effect; it fires once the delete succeeds and the lead is gone.
  useEffect(() => {
    if (state.status === "success") router.push("/leads");
  }, [state.status, router]);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={t("leads.delete.confirmTitle")}
      description={t("leads.delete.confirmBody")}
      trigger={<Button variant="ghost">{t("leads.delete.cta")}</Button>}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="leadId" value={leadId} />

        {state.status === "error" && state.formError ? (
          <FormAlert tone="error">{tm(state.formError)}</FormAlert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel={t("leads.saving")} className="w-auto">
            {t("leads.delete.confirm")}
          </SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("leads.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
