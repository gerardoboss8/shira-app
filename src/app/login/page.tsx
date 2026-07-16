"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError("Correo o contraseña incorrectos.");
      setCargando(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy to-primary p-4">
      <div className="w-full max-w-sm">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl bg-card p-6 shadow-2xl"
        >
          <div className="mb-2 flex flex-col items-center">
            <Image
              src="/logo.png"
              alt="Librería Shira"
              width={415}
              height={180}
              priority
              className="h-auto w-48"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Sistema interno de ventas
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu-correo@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full text-base" disabled={cargando}>
            {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
            {cargando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-primary-foreground/50">
          Acceso solo para personal autorizado
        </p>
      </div>
    </main>
  );
}
