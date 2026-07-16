/**
 * Tipos de la base de datos.
 *
 * Hecho a mano para arrancar. Cuando conectemos Supabase se puede regenerar
 * automáticamente con:
 *   npx supabase gen types typescript --project-id TU_REF > src/lib/database.types.ts
 */

export type Rol = "admin" | "vendedor" | "contador";
export type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "otro";
export type EstadoVenta = "completada" | "anulada";
export type TipoMovimiento =
  | "entrada"
  | "salida_venta"
  | "ajuste"
  | "devolucion"
  | "merma";
export type TipoRecordatorio = "aviso" | "tarea" | "fecha_importante";
export type EstadoSeguimiento =
  | "pendiente"
  | "en_proceso"
  | "listo_para_entrega"
  | "entregado"
  | "cancelado";
export type TipoSeguimiento =
  | "pedido_cliente"
  | "encargo_proveedor"
  | "tarea_interna";

type WithDefaults<T, OptionalKeys extends keyof T> = Omit<T, OptionalKeys> &
  Partial<Pick<T, OptionalKeys>>;

export interface Profile {
  id: string;
  nombre: string;
  role: Rol;
  activo: boolean;
  created_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  prefijo: string;
  orden: number;
}

export interface Producto {
  id: string;
  categoria_id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  costo: number | null;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Venta {
  id: string;
  folio: number;
  fecha: string;
  vendedor_id: string;
  cliente_nombre: string | null;
  metodo_pago: MetodoPago;
  subtotal: number;
  descuento: number;
  total: number;
  estado: EstadoVenta;
  nota: string | null;
}

export interface VentaItem {
  id: string;
  venta_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  total_linea: number;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  referencia_venta: string | null;
  nota: string | null;
  usuario_id: string | null;
  created_at: string;
}

export interface Recordatorio {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoRecordatorio;
  fecha: string | null;
  recurrente: "anual" | null;
  fijado: boolean;
  creado_por: string | null;
  visible_para: "todos" | "admins";
  completado: boolean;
  created_at: string;
}

export interface Seguimiento {
  id: string;
  tipo: TipoSeguimiento;
  titulo: string;
  detalle: string | null;
  contacto: string | null;
  estado: EstadoSeguimiento;
  fecha_compromiso: string | null;
  asignado_a: string | null;
  anticipo: number;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeguimientoNota {
  id: string;
  seguimiento_id: string;
  nota: string;
  usuario_id: string | null;
  created_at: string;
}

type TableDef<Row, InsertOptional extends keyof Row> = {
  Row: Row;
  Insert: WithDefaults<Row, InsertOptional>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile, "activo" | "role" | "created_at">;
      categorias: TableDef<Categoria, "id" | "orden">;
      productos: TableDef<
        Producto,
        "id" | "costo" | "stock" | "stock_minimo" | "activo" | "created_at" | "updated_at"
      >;
      ventas: TableDef<
        Venta,
        "id" | "folio" | "fecha" | "cliente_nombre" | "descuento" | "estado" | "nota"
      >;
      venta_items: TableDef<VentaItem, "id">;
      movimientos_inventario: TableDef<
        MovimientoInventario,
        "id" | "referencia_venta" | "nota" | "usuario_id" | "created_at"
      >;
      recordatorios: TableDef<
        Recordatorio,
        "id" | "descripcion" | "tipo" | "fecha" | "recurrente" | "fijado" | "creado_por" | "visible_para" | "completado" | "created_at"
      >;
      seguimientos: TableDef<
        Seguimiento,
        "id" | "detalle" | "contacto" | "estado" | "fecha_compromiso" | "asignado_a" | "anticipo" | "creado_por" | "created_at" | "updated_at"
      >;
      seguimiento_notas: TableDef<SeguimientoNota, "id" | "usuario_id" | "created_at">;
    };
    Views: Record<string, never>;
    Functions: {
      registrar_venta: {
        Args: {
          p_items: { producto_id: string; cantidad: number }[];
          p_metodo_pago?: MetodoPago;
          p_cliente_nombre?: string | null;
          p_descuento?: number;
          p_nota?: string | null;
          p_permitir_stock_negativo?: boolean;
        };
        Returns: { venta_id: string; folio: number; total: number };
      };
      anular_venta: {
        Args: { p_venta_id: string; p_motivo: string };
        Returns: undefined;
      };
      registrar_movimiento: {
        Args: {
          p_producto_id: string;
          p_tipo: Exclude<TipoMovimiento, "salida_venta">;
          p_cantidad: number;
          p_nota?: string | null;
        };
        Returns: string;
      };
      es_admin: { Args: Record<string, never>; Returns: boolean };
      rol_actual: { Args: Record<string, never>; Returns: Rol };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
