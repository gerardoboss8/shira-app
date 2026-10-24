import { requireProfile } from "@/lib/auth";
import { requireNegocio } from "@/lib/negocio";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, negocio] = await Promise.all([requireProfile(), requireNegocio()]);

  return (
    <AppShell nombre={profile.nombre} role={profile.role} negocioId={negocio.id}>
      {children}
    </AppShell>
  );
}
