import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <AppShell nombre={profile.nombre} role={profile.role}>
      {children}
    </AppShell>
  );
}
