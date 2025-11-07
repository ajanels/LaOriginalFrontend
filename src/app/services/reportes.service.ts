import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RangoFechas { desde?: string; hasta?: string; }

/** ====== VENTAS ====== */
export interface VentaDiaria {
  fecha: string;   // yyyy-MM-dd
  ventas: number;
  items: number;
  subtotal: number;
  descuento: number;
  total: number;
}

export interface VentasPorUsuario {
  usuarioId?: number | null;
  usuario: string;
  ventas: number;
  total: number;
  ticketPromedio: number;
  utilidad?: number | null; // puede venir null si no se pidió
}

export interface ClienteTop {
  clienteId: number;
  cliente: string;
  compras: number;
  total: number;
  ultimaCompra?: string | null;
}

export interface VentasPorProducto {
  presentacionId: number;
  producto: string;
  presentacion: string;
  categoria: string;
  cantidadVendida: number;
  total: number;
}

export interface VentasPorCategoria {
  categoriaId: number | null;
  categoria: string;
  cantidadVendida: number;
  total: number;
}

export interface GananciaPorProducto {
  presentacionId: number;
  producto: string;
  presentacion: string;
  categoria: string;
  cantidad: number;
  venta: number;
  costo: number;
  utilidad: number;
}

/** NUEVO: Ventas por forma de pago */
export interface VentasPorFormaPago {
  formaPagoId?: number | null;
  formaPago: string;
  ventas: number;
  total: number;
  ticketPromedio: number;
}

/** ====== COMPRAS ====== */
export interface ComprasPorProveedor {
  proveedorId: number;
  proveedor: string;
  documentos: number;
  total: number;
  ultimaCompra?: string | null;
}

/** ====== CAJA ====== */
export interface CajaDiaria {
  fecha: string;     // yyyy-MM-dd
  ingresos: number;
  egresos: number;
  neto: number;      // Ingresos - Egresos
}

/** NUEVO: Sesiones de caja cerradas */
export interface CajaSesionCerrada {
  aperturaId: number;
  codigo: string;
  cajeroNombre?: string | null;
  fechaAperturaUtc: string; // ISO
  fechaCierreUtc: string;   // ISO
  montoInicial: number;
  ingresos: number;
  egresos: number;
  neto: number;             // inicial + ingresos - egresos
  cierreDia: string;        // yyyy-MM-dd
}

/** ====== PEDIDOS ====== */
export interface PedidosCobrosFormaPagoRow {
  formaPagoId?: number | null;
  formaPago: string;
  cobros: number;
  devoluciones: number;
  neto: number;
  cantCobros: number;
  cantDevoluciones: number;
  fechaMin?: string | null;
  fechaMax?: string | null;
}

export interface PedidosCobrosFormaPagoResp {
  desdeUtc?: string | null;
  hastaUtc?: string | null;
  totalCobros: number;
  totalDevoluciones: number;
  totalNeto: number;
  filas: PedidosCobrosFormaPagoRow[];
}

export interface PedidosCobrosDetalle {
  pagoId: number;
  pedidoId: number;
  fechaUtc: string; // ISO
  esDevolucion: boolean;
  monto: number;
  formaPagoId: number;
  formaPago: string;
  referencia?: string | null;
  notas?: string | null;
  clienteId: number;
  cliente: string;
  estadoPedido: number; // EstadoPedidoCliente
}

export interface PedidosEstadoRow {
  estado: number;         // EstadoPedidoCliente
  cantidad: number;
  total: number;
  pagadoNeto: number;
  saldo: number;
}

export interface PedidosTopProductoRow {
  presentacionId: number;
  presentacion?: string | null;
  cantidad: number;
  importe: number;
}

/** ====== USUARIOS (reportes) ====== */
export interface UsuariosPorRol {
  rolId: number;
  rol: string;
  total: number;
  activos: number;
  inactivos: number;
  suspendidos: number;
}

export interface AltasPorMes {
  anio: number;
  mes: number;          // 1..12
  cantidad: number;
  periodo: string;      // "yyyy-MM"
}

export interface CumplesPorMes {
  mes: number;          // 1..12
  cantidad: number;
}

export interface UsuariosResumen {
  desdeUtc?: string | null;
  hastaUtc?: string | null;
  total: number;
  activos: number;
  inactivos: number;
  suspendidos: number;
  porRol: UsuariosPorRol[];
  altasPorMes: AltasPorMes[];
  cumplesPorMes: CumplesPorMes[];
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);
  /** Debe terminar en /api */
  private api = environment.apiBase;

  /** Helper para armar URL + params coherentes con el backend (Desde/Hasta) */
  private withRange(url: string, r?: RangoFechas, extra?: Record<string, string | number | boolean | undefined | null>) {
    let params = new HttpParams();
    if (r?.desde) params = params.set('Desde', r.desde);
    if (r?.hasta) params = params.set('Hasta', r.hasta);
    if (extra) {
      for (const k of Object.keys(extra)) {
        const v = extra[k];
        if (v !== undefined && v !== null) params = params.set(k, String(v));
      }
    }
    return { url: `${this.api}/reportes/${url}`, params };
  }

  /* ===== Ventas ===== */
  ventasDiarias(r?: RangoFechas): Observable<VentaDiaria[]> {
    const { url, params } = this.withRange('ventas/diarias', r);
    return this.http.get<VentaDiaria[]>(url, { params });
  }

  ventasPorUsuario(r?: RangoFechas, incluirUtilidad = true): Observable<VentasPorUsuario[]> {
    const { url, params } = this.withRange('ventas/por-usuario', r, { incluirUtilidad });
    return this.http.get<VentasPorUsuario[]>(url, { params });
  }

  topClientes(r?: RangoFechas, top = 10): Observable<ClienteTop[]> {
    const { url, params } = this.withRange('ventas/top-clientes', r, { top });
    return this.http.get<ClienteTop[]>(url, { params });
  }

  ventasPorProducto(r?: RangoFechas): Observable<VentasPorProducto[]> {
    const { url, params } = this.withRange('ventas/por-producto', r);
    return this.http.get<VentasPorProducto[]>(url, { params });
  }

  ventasPorCategoria(r?: RangoFechas): Observable<VentasPorCategoria[]> {
    const { url, params } = this.withRange('ventas/por-categoria', r);
    return this.http.get<VentasPorCategoria[]>(url, { params });
  }

  gananciaPorProducto(r?: RangoFechas): Observable<GananciaPorProducto[]> {
    const { url, params } = this.withRange('ganancia/por-producto', r);
    return this.http.get<GananciaPorProducto[]>(url, { params });
  }

  /** NUEVO: Ventas por forma de pago */
  ventasPorFormaPago(r?: RangoFechas): Observable<VentasPorFormaPago[]> {
    const { url, params } = this.withRange('ventas/por-forma-pago', r);
    return this.http.get<VentasPorFormaPago[]>(url, { params });
  }

  /* ===== Compras ===== */
  comprasPorProveedor(r?: RangoFechas): Observable<ComprasPorProveedor[]> {
    const { url, params } = this.withRange('compras/por-proveedor', r);
    return this.http.get<ComprasPorProveedor[]>(url, { params });
  }

  /* ===== Caja ===== */
  cajaIngresosEgresosDiarios(r?: RangoFechas): Observable<CajaDiaria[]> {
    const { url, params } = this.withRange('caja/ingresos-egresos-diarios', r);
    return this.http.get<CajaDiaria[]>(url, { params });
  }

  /** NUEVO: sesiones cerradas */
  cajaSesionesCerradas(r?: RangoFechas): Observable<CajaSesionCerrada[]> {
    const { url, params } = this.withRange('caja/sesiones-cerradas', r);
    return this.http.get<CajaSesionCerrada[]>(url, { params });
  }

  /* ===== Pedidos ===== */
  pedidosCobrosFormaPago(
    r?: RangoFechas,
    opts?: { clienteId?: number; formaPagoId?: number; incluirCancelados?: boolean }
  ): Observable<PedidosCobrosFormaPagoResp> {
    const { url, params } = this.withRange('pedidos/cobros-forma-pago', r, opts);
    return this.http.get<PedidosCobrosFormaPagoResp>(url, { params });
  }

  pedidosCobrosDetalle(
    r?: RangoFechas,
    opts?: { clienteId?: number; formaPagoId?: number; incluirCancelados?: boolean; page?: number; pageSize?: number; take?: number }
  ): Observable<PedidosCobrosDetalle[]> {
    const { url, params } = this.withRange('pedidos/cobros-detalle', r, opts);
    return this.http.get<PedidosCobrosDetalle[]>(url, { params });
  }

  pedidosEstados(r?: RangoFechas, clienteId?: number): Observable<PedidosEstadoRow[]> {
    const { url, params } = this.withRange('pedidos/estados', r, { clienteId });
    return this.http.get<PedidosEstadoRow[]>(url, { params });
  }

  pedidosTopProductos(
    r?: RangoFechas,
    opts?: { take?: number; incluirBorrador?: boolean; incluirCancelado?: boolean; categoriaId?: number }
  ): Observable<PedidosTopProductoRow[]> {
    const { url, params } = this.withRange('pedidos/top-productos', r, opts);
    return this.http.get<PedidosTopProductoRow[]>(url, { params });
  }

  /* ===== Usuarios ===== */
  usuariosResumen(
    r?: RangoFechas,
    opts?: { rolId?: number; estado?: 'Activo' | 'Inactivo' | 'Suspendido' }
  ): Observable<UsuariosResumen> {
    const { url, params } = this.withRange('usuarios/resumen', r, opts);
    return this.http.get<UsuariosResumen>(url, { params });
  }
}
