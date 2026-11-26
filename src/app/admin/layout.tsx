import type { ReactNode } from "react";
import { AdminShell } from "@/components/layout/admin-shell";
import { project } from "@/config/project";
import { identityMessages as m } from "@/i18n/identity-ro";
import { requireAdmin } from "@/infrastructure/auth/access";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  return (
    <AdminShell
      title={m.administrator}
      unavailableLabel={m.comingLater}
      navigation={[
        {
          label: m.adminNavigation[0],
          href: project.routes.admin,
          current: true,
        },
        ...m.adminNavigation.slice(1).map((label) => ({ label })),
        { label: m.account, href: project.routes.account },
      ]}
    >
      {children}
    </AdminShell>
  );
}
