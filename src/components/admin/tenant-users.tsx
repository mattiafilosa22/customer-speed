"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { AdminUserListItem } from "@/server/admin";
import { Button, Card, CardBody, Input, Pill, Select } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "@/app/(admin)/admin/actions";

/**
 * Per-tenant user management (docs/04 §4.10, docs/02 §2.1). Lists the tenant's
 * users and offers: invite a new user (role proUser/baseUser), toggle role,
 * activate/deactivate, and trigger a password reset. All mutations go through the
 * audited admin Server Actions (RBAC + isolation enforced server-side); on
 * success the route is refreshed so the server-rendered list updates.
 *
 * `superAdmin` users never appear here (the use case excludes them); roles
 * assignable from this UI are only proUser / baseUser.
 */

type AssignableRole = "proUser" | "baseUser";

export function TenantUsers({
  organizationId,
  users,
}: {
  organizationId: string;
  users: ReadonlyArray<AdminUserListItem>;
}) {
  const t = useTranslations("admin.users");
  const tr = useTranslations("admin.roles");
  const tm = useMessage();
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Invite form state.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("baseUser");

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "admin.errors.generic");
      }
    });
  }

  function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    run(async () => {
      await createUserAction({ organizationId, name, email, role });
      setName("");
      setEmail("");
      setRole("baseUser");
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <h2 className="font-display text-xl text-ink">{t("title")}</h2>

        {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}

        {/* Invite */}
        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label={t("invite.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
          <Input
            label={t("invite.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
          />
          <Select
            label={t("invite.role")}
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
          >
            <option value="proUser">{tr("proUser")}</option>
            <option value="baseUser">{tr("baseUser")}</option>
          </Select>
          <Button type="submit" disabled={pending}>
            {t("invite.submit")}
          </Button>
        </form>

        {/* List */}
        {users.length === 0 ? (
          <p className="font-body text-[14px] text-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t("title")}</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-body text-[12px] text-muted">
                    {t("table.name")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-body text-[12px] text-muted">
                    {t("table.role")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-body text-[12px] text-muted">
                    {t("table.status")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-body text-[12px] text-muted">
                    {t("table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line2 last:border-0">
                    <td className="px-3 py-3 font-body text-[14px] text-ink">
                      <div className="font-medium">{u.name}</div>
                      <div className="font-body text-[12px] text-muted">{u.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        label={t("table.role")}
                        hideLabel
                        value={u.role}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            updateUserAction({
                              organizationId,
                              userId: u.id,
                              role: e.target.value as AssignableRole,
                            }),
                          )
                        }
                      >
                        <option value="proUser">{tr("proUser")}</option>
                        <option value="baseUser">{tr("baseUser")}</option>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      {u.isActive ? (
                        <Pill tone="ok">{t("status.active")}</Pill>
                      ) : (
                        <Pill tone="exec">{t("status.inactive")}</Pill>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              updateUserAction({
                                organizationId,
                                userId: u.id,
                                isActive: !u.isActive,
                              }),
                            )
                          }
                        >
                          {u.isActive ? t("actions.deactivate") : t("actions.activate")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(() => resetUserPasswordAction({ organizationId, userId: u.id }))
                          }
                        >
                          {t("actions.resetPassword")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
