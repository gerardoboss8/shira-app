import Image from "next/image";
import { requireProfile } from "@/lib/auth";
import { getNegocio } from "@/lib/negocio";
import { LISTA_NEGOCIOS } from "@/lib/negocios";
import { cn } from "@/lib/utils";
import { elegirNegocio } from "./actions";

export const dynamic = "force-dynamic";

/** Al entrar a la app: ¿en qué negocio vamos a trabajar? */
export default async function ElegirNegocioPage() {
  const [profile, actual] = await Promise.all([requireProfile(), getNegocio()]);
  const primerNombre = profile.nombre.split(" ")[0];

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Hola, {primerNombre}</h1>
          <p className="text-sm text-muted-foreground">
            ¿Con qué negocio vamos a trabajar?
          </p>
        </div>

        <div className="space-y-3">
          {LISTA_NEGOCIOS.map((n) => (
            <form key={n.id} action={elegirNegocio}>
              <input type="hidden" name="negocio" value={n.id} />
              <button
                type="submit"
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border-2 bg-card p-4 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.99]",
                  actual?.id === n.id ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl",
                    n.id === "artisan" ? "bg-[#2e1a5c]" : "bg-white",
                  )}
                >
                  <Image
                    src={n.logoTarjeta.src}
                    alt={n.nombre}
                    width={n.logoTarjeta.width}
                    height={n.logoTarjeta.height}
                    priority
                    className="h-auto max-h-full w-full object-contain"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold">{n.nombre}</span>
                  <span className="block text-sm text-muted-foreground">{n.descripcion}</span>
                  {actual?.id === n.id && (
                    <span className="mt-1 block text-xs font-medium text-primary">
                      Último usado
                    </span>
                  )}
                </span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
