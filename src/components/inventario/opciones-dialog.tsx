"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Categoria, OpcionCategoria } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";

type GrupoEdit = { nombre: string; valores: string };

/**
 * Opciones que se eligen al vender, por categoría (Color, Diseño, Cuadro…).
 * Cada valor va en su propia línea.
 */
export function OpcionesDialog({
  categorias,
  abierto,
  onClose,
}: {
  categorias: Categoria[];
  abierto: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState("");
  const [grupos, setGrupos] = useState<GrupoEdit[]>([]);
  const [procesando, setProcesando] = useState(false);

  function cargar(id: string) {
    const cat = categorias.find((c) => c.id === id);
    setCategoriaId(id);
    setGrupos(
      (cat?.opciones ?? []).map((g) => ({ nombre: g.nombre, valores: g.valores.join("\n") })),
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al abrir
    if (abierto) cargar(categorias[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function cambiar(i: number, campo: keyof GrupoEdit, valor: string) {
    setGrupos((prev) => prev.map((g, j) => (j === i ? { ...g, [campo]: valor } : g)));
  }

  async function guardar() {
    const opciones: OpcionCategoria[] = grupos
      .map((g) => ({
        nombre: g.nombre.trim(),
        valores: [
          ...new Set(
            g.valores
              .split(/\r?\n/)
              .map((v) => v.trim())
              .filter(Boolean),
          ),
        ],
      }))
      .filter((g) => g.nombre && g.valores.length > 0);

    setProcesando(true);
    const { error } = await createClient()
      .from("categorias")
      .update({ opciones })
      .eq("id", categoriaId);
    setProcesando(false);
    if (error) {
      toast.error(error.message ?? "No se pudo guardar.");
      return;
    }
    toast.success("Opciones guardadas.");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opciones al vender</DialogTitle>
          <DialogDescription>
            Listas que se eligen al agregar un producto de esta categoría (color, diseño, cuadro…).
            Salen en el comprobante. Un valor por línea.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => cargar(c.id)}
                className={
                  c.id === categoriaId
                    ? "rounded-full border border-primary bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                    : "rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-accent"
                }
              >
                {c.nombre}
              </button>
            ))}
          </div>

          {grupos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Esta categoría no pide opciones al vender.
            </p>
          )}

          {grupos.map((g, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={`op-nombre-${i}`}>Nombre de la lista</Label>
                  <Input
                    id={`op-nombre-${i}`}
                    value={g.nombre}
                    placeholder="Ej. Color"
                    onChange={(e) => cambiar(i, "nombre", e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar lista"
                  onClick={() => setGrupos((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`op-valores-${i}`}>Valores (uno por línea)</Label>
                <textarea
                  id={`op-valores-${i}`}
                  rows={6}
                  value={g.valores}
                  onChange={(e) => cambiar(i, "valores", e.target.value)}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setGrupos((prev) => [...prev, { nombre: "", valores: "" }])}
            disabled={!categoriaId}
          >
            <Plus className="h-4 w-4" /> Agregar lista
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={procesando || !categoriaId}>
            {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
