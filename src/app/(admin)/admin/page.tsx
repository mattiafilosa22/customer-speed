import { Card, CardBody } from "@/components/ui";

/**
 * Admin landing (Fase 1 placeholder). Reaching this page already implies the
 * layout guard passed (superAdmin only). Tenant management UI lands in a later
 * phase; this confirms the cross-tenant area is gated and routable.
 */
export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-ink">Area amministrazione</h1>
      <Card>
        <CardBody className="flex flex-col gap-2">
          <p className="font-body text-[14px] text-ink">
            Console cross-tenant riservata al super amministratore.
          </p>
          <p className="font-body text-[13px] text-muted">
            La gestione dei tenant (creazione, configurazione, feature flag, tema) arriverà
            nelle fasi successive della roadmap.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
