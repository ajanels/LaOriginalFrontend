import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export enum TipoPedidoCliente {
  Completo = 0,
  Personalizado = 1
}

/* ===== helpers enums ===== */
function normEnum(s: any): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

/** Intenta parsear número o nombre -> número (por si el backend devolviera string) */
const parseEstado = (v: any): number => {
  if (typeof v === 'number') return v;
  const k = normEnum(v);
  if (!k) return 0;
  if (k === 'borrador') return 0;
  if (k === 'confirmado') return 1;
  if (k === 'enpreparacion') return 2;
  if (k === 'listo') return 3;
  if (k === 'entregado') return 4;
  if (k === 'cancelado') return 9;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseTipo = (v: any): number => {
  if (typeof v === 'number') return v;
  const k = normEnum(v);
  if (!k) return 0;
  if (k === 'completo') return 0;
  if (k === 'personalizado') return 1;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ===== tipos ===== */
export interface PedidoClienteDisenoDto {
  lienzos: number;
  color?: string | null;
  brich: boolean;
  otros?: string | null;
  reportado?: boolean | null;
  extra?: string | null;
}

export interface PedidoClienteListDto {
  id: number;
  fechaCreacionUtc: string;
  cliente: string;
  descripcion?: string | null;
  estado: number;
  tipo: number;
  total: number;
  cuentaAlDia: boolean;
}

export interface PedidoClienteDetalleDto {
  id?: number;
  presentacionId: number;
  presentacionNombre?: string | null;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario: number;
  totalLinea: number;
  notas?: string | null;

  /* Aux opcionales para imagen/nombre de producto */
  productoId?: number | null;
  productoNombre?: string | null;
  productoCodigo?: string | null;
  fotoUrl?: string | null;
}

export interface PedidoClienteCreateDto {
  clienteId: number;
  clienteNombre: string;
  telefono?: string;
  direccionEntrega?: string;
  fechaEntregaCompromisoUtc?: string;
  estado: number;
  tipo: number;
  observaciones?: string;
  subtotal: number;
  descuento: number;
  total: number;
  detalles: PedidoClienteDetalleDto[];
  diseno?: PedidoClienteDisenoDto;
}

export interface PedidoClienteDetailDto extends PedidoClienteCreateDto {
  id: number;
  /** NUEVO: mapeado del backend */
  fechaCreacionUtc?: string;
  pagos: Array<{
    id: number;
    fechaUtc: string;
    formaPagoId: number;
    formaPagoNombre: string;
    monto: number;
    referencia?: string | null;
    notas?: string | null;
    esDevolucion?: boolean;
    pagoOriginalId?: number | null;
  }>;
  montoPagado: number;
  saldo: number;
  totalCobrado?: number;
  totalDevuelto?: number;
}

export interface CatalogItemDto {
  id: number;                       // PresentaciónId
  productoId: number;
  producto: string;
  productoCodigo?: string | null;
  nombre: string;                   // Nombre de la presentación
  precioVentaDefault?: number | null;
  unidad?: string | null;
  fotoUrl?: string | null;
  stock?: number;
  reservado?: number;
  disponible?: number;
  categoriaId?: number | null;
  categoria?: string | null;
}

/* ===== “Disponible” (opcionales) ===== */
export interface StockDisponibleDto {
  presentacionId: number;
  stock: number;
  reservado: number;
  disponible: number;
  precioVenta?: number | null;
}

@Injectable({ providedIn: 'root' })
export class PedidosClientesService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/PedidosClientes`;

  list(params?: {
    term?: string; clienteId?: number; estado?: number; take?: number; desde?: string; hasta?: string;
  }): Observable<PedidoClienteListDto[]> {
    let hp = new HttpParams();
    if (params?.term) hp = hp.set('term', params.term);
    if (params?.clienteId != null) hp = hp.set('clienteId', String(params.clienteId));
    if (params?.estado != null) hp = hp.set('estado', String(params.estado));
    if (params?.take != null) hp = hp.set('take', String(params.take));
    if (params?.desde) hp = hp.set('desde', params.desde);
    if (params?.hasta) hp = hp.set('hasta', params.hasta);

    return this.http.get<any[]>(this.API, { params: hp }).pipe(
      map(rows => (rows || []).map(r => ({
        id: r.id,
        fechaCreacionUtc: r.fechaCreacionUtc,
        cliente: r.cliente,
        descripcion: r.descripcion,
        estado: parseEstado(r.estado),
        tipo: parseTipo(r.tipo),
        total: r.total,
        cuentaAlDia: !!r.cuentaAlDia
      } as PedidoClienteListDto)))
    );
  }

  getById(id: number): Observable<PedidoClienteDetailDto> {
    return this.http.get<any>(`${this.API}/${id}`).pipe(
      map(r => ({
        id: r.id,
        clienteId: r.clienteId,
        clienteNombre: r.clienteNombre,
        telefono: r.telefono,
        direccionEntrega: r.direccionEntrega,
        fechaEntregaCompromisoUtc: r.fechaEntregaCompromisoUtc,
        /** NUEVO: viene del backend */
        fechaCreacionUtc: r.fechaCreacionUtc,
        estado: parseEstado(r.estado),
        tipo: parseTipo(r.tipo),
        observaciones: r.observaciones,
        subtotal: r.subtotal,
        descuento: r.descuento,
        total: r.total,
        detalles: (r.detalles || []).map((d: any) => ({
          id: d.id,
          presentacionId: d.presentacionId,
          presentacionNombre: d.presentacionNombre,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          descuentoUnitario: d.descuentoUnitario,
          totalLinea: d.totalLinea,
          notas: d.notas,
          // auxiliares si el backend los trae
          productoId: d.productoId ?? null,
          productoNombre: d.productoNombre ?? null,
          productoCodigo: d.productoCodigo ?? null,
          fotoUrl: d.fotoUrl ?? d.productoFotoUrl ?? d.presentacionFotoUrl ?? null
        })),
        pagos: (r.pagos || []).map((p: any) => ({
          id: p.id,
          fechaUtc: p.fechaUtc,
          formaPagoId: p.formaPagoId,
          formaPagoNombre: p.formaPagoNombre,
          monto: p.monto,
          referencia: p.referencia,
          notas: p.notas,
          esDevolucion: !!p.esDevolucion,
          pagoOriginalId: p.pagoOriginalId ?? null
        })),
        montoPagado: r.montoPagado,
        saldo: r.saldo,
        totalCobrado: r.totalCobrado ?? 0,
        totalDevuelto: r.totalDevuelto ?? 0,
        diseno: r.diseno ? {
          lienzos: r.diseno.lienzos ?? 0,
          color: r.diseno.color ?? null,
          brich: !!r.diseno.brich,
          otros: r.diseno.otros ?? null,
          reportado: r.diseno.reportado ?? null,
          extra: r.diseno.extra ?? null
        } : undefined
      }))
    );
  }

  /** ==== IMPORTANTE: ahora enviamos números para Estado/Tipo ==== */
  create(dto: PedidoClienteCreateDto): Observable<{ id: number } | { Id: number }> {
    const body: any = {
      ClienteId: dto.clienteId,
      ClienteNombre: dto.clienteNombre,
      Telefono: dto.telefono ?? null,
      DireccionEntrega: dto.direccionEntrega ?? null,
      FechaEntregaCompromisoUtc: dto.fechaEntregaCompromisoUtc ?? null,
      Estado: dto.estado,            // <-- número
      Tipo: dto.tipo,                // <-- número
      Observaciones: dto.observaciones ?? null,
      Subtotal: dto.subtotal,
      Descuento: dto.descuento,
      Total: dto.total,
      Detalles: (dto.detalles ?? []).map(d => ({
        PresentacionId: d.presentacionId,
        PresentacionNombre: d.presentacionNombre ?? null,
        Cantidad: d.cantidad,
        PrecioUnitario: d.precioUnitario,
        DescuentoUnitario: d.descuentoUnitario,
        TotalLinea: d.totalLinea,
        Notas: d.notas ?? null
      }))
    };

    body.Diseno = dto.diseno ? {
      Lienzos: dto.diseno.lienzos ?? 0,
      Color: dto.diseno.color ?? null,
      Brich: !!dto.diseno.brich,
      Otros: dto.diseno.otros ?? null,
      Reportado: dto.diseno.reportado ?? null,
      Extra: dto.diseno.extra ?? null
    } : null;

    return this.http.post<{ id: number } | { Id: number }>(this.API, body);
  }

  update(id: number, dto: PedidoClienteCreateDto): Observable<void> {
    const body: any = {
      Id: id,
      ClienteId: dto.clienteId,
      ClienteNombre: dto.clienteNombre,
      Telefono: dto.telefono ?? null,
      DireccionEntrega: dto.direccionEntrega ?? null,
      FechaEntregaCompromisoUtc: dto.fechaEntregaCompromisoUtc ?? null,
      Estado: dto.estado,            // <-- número
      Tipo: dto.tipo,                // <-- número
      Observaciones: dto.observaciones ?? null,
      Subtotal: dto.subtotal,
      Descuento: dto.descuento,
      Total: dto.total,
      Detalles: (dto.detalles ?? []).map(d => ({
        PresentacionId: d.presentacionId,
        PresentacionNombre: d.presentacionNombre ?? null,
        Cantidad: d.cantidad,
        PrecioUnitario: d.precioUnitario,
        DescuentoUnitario: d.descuentoUnitario,
        TotalLinea: d.totalLinea,
        Notas: d.notas ?? null
      }))
    };

    body.Diseno = dto.diseno ? {
      Lienzos: dto.diseno.lienzos ?? 0,
      Color: dto.diseno.color ?? null,
      Brich: !!dto.diseno.brich,
      Otros: dto.diseno.otros ?? null,
      Reportado: dto.diseno.reportado ?? null,
      Extra: dto.diseno.extra ?? null
    } : null;

    return this.http.put<void>(`${this.API}/${id}`, body);
  }

  /** ==== IMPORTANTE: ahora enviamos número para NuevoEstado ==== */
  cambiarEstado(id: number, nuevoEstado: number, motivo?: string) {
    const body = { NuevoEstado: nuevoEstado, Motivo: motivo ?? null }; // <-- número
    return this.http.patch<any>(`${this.API}/${id}/estado`, body).pipe(
      map(r => ({
        id: r?.id ?? r?.Id,
        estado: parseEstado(r?.estado ?? r?.Estado)
      }))
    );
  }

  convertirAVenta(id: number) {
    return this.http.post<{ message: string; Id: number }>(
      `${this.API}/${id}/convertir-a-venta`, {}
    );
  }

  /** Catálogo (con filtro opcional por categoría) */
  catalogo(params: {
    term?: string; soloActivos?: boolean; take?: number; excluirPedidoId?: number; categoriaId?: number | null
  }): Observable<CatalogItemDto[]> {
    let hp = new HttpParams();
    if (params?.term) hp = hp.set('term', params.term);
    if (params?.soloActivos != null) hp = hp.set('soloActivos', String(params.soloActivos));
    if (params?.take != null) hp = hp.set('take', String(params.take));
    if (params?.excluirPedidoId != null) hp = hp.set('excluirPedidoId', String(params.excluirPedidoId));
    if (params?.categoriaId != null) hp = hp.set('categoriaId', String(params.categoriaId));

    return this.http.get<any[]>(`${this.API}/catalogo`, { params: hp }).pipe(
      map(rows => (rows || []).map(r => ({
        id: r.id,
        productoId: r.productoId,
        producto: r.producto,
        productoCodigo: r.productoCodigo,
        nombre: r.nombre,
        precioVentaDefault: r.precioVentaDefault,
        unidad: r.unidad,
        fotoUrl: r.fotoUrl,
        stock: r.stock,
        reservado: r.reservado,
        disponible: r.disponible,
        categoriaId: r.categoriaId ?? r.productoCategoriaId ?? null,
        categoria:   r.categoria   ?? r.productoCategoria   ?? null
      } as CatalogItemDto)))
    );
  }

  agregarPago(
    id: number,
    dto: { formaPagoId: number; monto: number; referencia?: string; notas?: string; fechaUtc?: string }
  ) {
    const body = {
      FormaPagoId: dto.formaPagoId,
      Monto: dto.monto,
      Referencia: dto.referencia ?? null,
      Notas: dto.notas ?? null,
      FechaUtc: dto.fechaUtc ?? null
    };
    return this.http.post<{ id: number } | { Id: number }>(`${this.API}/${id}/pagos`, body);
  }

  agregarDevolucion(
    id: number,
    dto: { formaPagoId: number; monto: number; referencia?: string; notas?: string; fechaUtc?: string; pagoOriginalId?: number }
  ) {
    const body = {
      FormaPagoId: dto.formaPagoId,
      Monto: dto.monto,
      Referencia: dto.referencia ?? null,
      Notas: dto.notas ?? null,
      FechaUtc: dto.fechaUtc ?? null,
      PagoOriginalId: dto.pagoOriginalId ?? null
    };
    return this.http.post<{ id: number } | { Id: number }>(`${this.API}/${id}/devoluciones`, body);
  }

  eliminar(id: number) {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  /* ===== Disponible ===== */
  getDisponible(presentacionId: number, excluirPedidoId?: number): Observable<StockDisponibleDto> {
    let hp = new HttpParams();
    if (excluirPedidoId != null) hp = hp.set('excluirPedidoId', String(excluirPedidoId));
    return this.http.get<any>(`${this.API}/disponible/${presentacionId}`, { params: hp }).pipe(
      map(r => ({
        presentacionId: r.presentacionId,
        stock: r.stock,
        reservado: r.reservado,
        disponible: r.disponible,
        precioVenta: r.precioVenta
      } as StockDisponibleDto))
    );
  }

  getDisponibles(ids: number[], excluirPedidoId?: number): Observable<StockDisponibleDto[]> {
    if (!ids?.length) {
      return new Observable<StockDisponibleDto[]>(obs => { obs.next([]); obs.complete(); });
    }
    let hp = new HttpParams().set('ids', ids.join(','));
    if (excluirPedidoId != null) hp = hp.set('excluirPedidoId', String(excluirPedidoId));
    return this.http.get<any[]>(`${this.API}/disponible`, { params: hp }).pipe(
      map(rows => (rows || []).map(r => ({
        presentacionId: r.presentacionId,
        stock: r.stock,
        reservado: r.reservado,
        disponible: r.disponible,
        precioVenta: r.precioVenta
      })))
    );
  }
}
