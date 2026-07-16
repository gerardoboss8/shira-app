"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Rol } from "@/lib/database.types";
import {
  Home,
  ShoppingCart,
  Receipt,
  Package,
  Wallet,
  BarChart3,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  roles?: Rol[]; // si se omite, visible para todos
};

const NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/ventas/nueva", label: "Vender", icon: ShoppingCart, roles: ["admin", "vendedor"] },
  { href: "/ventas", label: "Ventas", icon: Receipt },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/gastos", label: "Gastos", icon: Wallet, roles: ["admin", "vendedor"] },
];

const rolLabel: Record<Rol, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  contador: "Contador",
};

export function AppShell({
  nombre,
  role,
  children,
}: {
  nombre: string;
  role: Rol;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  const items = NAV.filter((i) => !i.roles || i.roles.includes(role));

  // El item activo es el de href más específico que coincide con la ruta.
  const hrefActivo = items
    .map((i) => i.href)
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    )
    .sort((a, b) => b.length - a.length)[0];

  function activo(href: string) {
    return href === hrefActivo;
  }

  async function salir() {
    setSaliendo(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const iniciales = nombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Cabecera */}
      <header className="sticky top-0 z-30 border-b bg-card shadow-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="Librería Shira"
              width={415}
              height={180}
              priority
              className="h-7 w-auto"
            />
          </Link>

          {/* Nav horizontal (desktop) */}
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((i) => {
              const Icon = i.icon;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    activo(i.href)
                      ? "bg-accent font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {i.label}
                </Link>
              );
            })}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground outline-none ring-ring/40 focus-visible:ring-2">
              {iniciales}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <div className="font-medium">{nombre}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {rolLabel[role]}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(role === "admin" || role === "contador") && (
                <>
                  <DropdownMenuItem render={<Link href="/reportes" />}>
                    <BarChart3 className="h-4 w-4" /> Reportes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={salir} disabled={saliendo}>
                <LogOut className="h-4 w-4" />
                {saliendo ? "Saliendo…" : "Cerrar sesión"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 md:pb-8">
        {children}
      </main>

      {/* Nav inferior (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card md:hidden">
        <div
          className="mx-auto grid max-w-5xl"
          style={{
            gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          }}
        >
          {items.map((i) => {
            const Icon = i.icon;
            const on = activo(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                  on ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", on && "stroke-[2.5]")} />
                {i.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
