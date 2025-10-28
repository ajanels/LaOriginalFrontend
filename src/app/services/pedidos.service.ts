import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Códigos del enum del backend */
export type EstadoPedidoProveedorCode = 0 | 1 | 2 | 3 | 4 | 5;
/** Nombres del enum del backend (tal cual en C#) */
export type EstadoPedidoProveedorName =
  | 'Borrador'
  | 'Enviado'
  | 'Aprobado'
  | 'ParcialmenteRecibido'
  | 'Cerrado'
  | 'Cancelado';

/** Aceptamos número o texto (tolerante) */
export type EstadoPedidoProveedorAny = EstadoPedidoProveedorCode | EstadoPedidoProveedorName | string;

export interface PedidoProveedorListItem {
  id: number;
  fecha: string;                      // ISO
  numero: string | null;
  proveedorId: number;
  proveedorNombre: string;
  /** ← ahora acepta number o string */
  estado: EstadoPedidoProveedorAny;
  subtotal: number;
  descuento: number;
  total: number;
}

export interface PedidoProveedorDetalleDto {
  id: number;
  presentacionId: number;
  productoNombre: string;
  presentacionNombre: string;
  unidad: string;
  sku?: string | null;
  cantidad: number;
  cantidadRecibida: number;
  precioUnitario: number;
  descuento: number;
  totalLinea: number;
  notas?: string | null;
}

export interface PedidoProveedorDto {
  id: number;
  fecha: string;
  numero: string | null;
  proveedorId: number;
  proveedorNombre: string;
  estado: EstadoPedidoProveedorAny;
  subtotal: number;
  descuento: number;
  total: number;
  observaciones?: string | null;
  /** usado en “Ver detalle” si hubo recepciones */
  formaPago?: string | null;
  detalles: PedidoProveedorDetalleDto[];
}

export interface PedidoProveedorCreate {
  numero?: string | null;
  proveedorId: number;
  observaciones?: string | null;
  detalles: Array<{
    presentacionId: number;
    cantidad: number;
    /** viene prellenado y bloqueado en UI */
    precioUnitario?: number;
    descuento?: number;
    notas?: string | null;
  }>;
}

/** (Compat) Ya no se usa para editar precio desde pedidos */
export interface ProveedorCatalogoItem {
  presentacionId: number;
  productoId: number;
  productoNombre: string;
  presentacionNombre: string;
  unidad: string;
  color?: string | null;
  sku?: string | null;
  codigoBarras?: string | null;
  codigoProveedor?: string | null;
  precioSugerido?: number | null;
  activo: boolean;
}

export interface PedidoRecepcionCreate {
  fecha: string;
  numero?: string | null;
  formaPagoId: number;
  /** referencia depósito/transferencia cuando aplique */
  referencia?: string | null;
  lineas: Array<{
    pedidoProveedorDetalleId: number;
    cantidad: number;
    costoUnitario: number;
    notas?: string | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}`;

  list(params?: {
    proveedorId?: number;
    /** puede ser 0..5 o “Borrador”, “ParcialmenteRecibido”, … */
    estado?: EstadoPedidoProveedorAny;
    desde?: string;
    hasta?: string;
    page?: number;
    pageSize?: number;
  }): Observable<PedidoProveedorListItem[]> {
    let p = new HttpParams();
    if (params?.proveedorId != null) p = p.set('proveedorId', String(params.proveedorId));
    if (params?.estado !== undefined && params?.estado !== null) {
      // El binder de ASP.NET acepta "3" o "ParcialmenteRecibido"
      p = p.set('estado', String(params.estado));
    }
    if (params?.desde)               p = p.set('desde', params.desde);
    if (params?.hasta)               p = p.set('hasta', params.hasta);
    if (params?.page != null)        p = p.set('page', String(params.page));
    if (params?.pageSize != null)    p = p.set('pageSize', String(params.pageSize));

    return this.http.get<PedidoProveedorListItem[]>(`${this.API}/PedidosProveedores`, { params: p });
  }

  getById(id: number): Observable<PedidoProveedorDto> {
    return this.http.get<PedidoProveedorDto>(`${this.API}/PedidosProveedores/${id}`);
  }

  create(dto: PedidoProveedorCreate): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.API}/PedidosProveedores`, dto);
  }

  enviar(id: number): Observable<void> {
    return this.http.post<void>(`${this.API}/PedidosProveedores/${id}/enviar`, {});
  }

  aprobar(id: number): Observable<void> {
    return this.http.post<void>(`${this.API}/PedidosProveedores/${id}/aprobar`, {});
  }

  cancelar(id: number): Observable<void> {
    return this.http.post<void>(`${this.API}/PedidosProveedores/${id}/cancelar`, {});
  }

  /** (Compat) listado de catálogo – si aún lo usas desde aquí */
  listCatalogo(proveedorId: number, term?: string, soloActivos = true): Observable<ProveedorCatalogoItem[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<ProveedorCatalogoItem[]>(
      `${this.API}/Proveedores/${proveedorId}/Catalogo`,
      { params }
    );
  }

  addToCatalog(
    proveedorId: number,
    body: { presentacionId: number; codigoProveedor?: string | null; precioLista?: number | null; notas?: string | null }
  ): Observable<any> {
    return this.http.post(`${this.API}/Proveedores/${proveedorId}/Catalogo`, body);
  }

  recibir(pedidoId: number, dto: PedidoRecepcionCreate): Observable<any> {
    return this.http.post<any>(`${this.API}/PedidosProveedores/${pedidoId}/recepciones`, dto);
  }
}
