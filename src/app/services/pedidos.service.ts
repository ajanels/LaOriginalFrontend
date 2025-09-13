import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type EstadoPedidoProveedor =
  | 'borrador'
  | 'enviado'
  | 'aprobado'
  | 'parcialmenteRecibido'
  | 'cerrado'
  | 'cancelado';

export interface PedidoListItem {
  id: number;
  fecha: string; // ISO
  numero: string | null;
  proveedorId: number;
  proveedorNombre: string;
  estado: EstadoPedidoProveedor;
  subtotal: number;
  descuento: number;
  total: number;
}

// src/app/services/pedidos.service.ts
export interface PedidoDetalle {
  id: number;
  presentacionId: number;
  presentacionNombre: string;
  unidad: string;
  sku: string | null;
  cantidad: number;
  cantidadRecibida: number;
  precioUnitario: number;
  descuento: number;
  totalLinea: number;
  notas: string | null;

  // ---- Campos SOLO de UI (opcionales) ----
  _recibir?: number;
  _costo?: number;
  _notas?: string | null;
}


export interface PedidoFull extends PedidoListItem {
  observaciones: string | null;
  detalles: PedidoDetalle[];
}

export interface PedidoDetalleCreate {
  presentacionId: number;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  notas?: string | null;
}

export interface PedidoCreate {
  proveedorId: number;
  numero?: string | null;
  observaciones?: string | null;
  detalles: PedidoDetalleCreate[];
}

export interface RecepcionLinea {
  pedidoProveedorDetalleId: number;
  cantidad: number;
  costoUnitario: number;
  notas?: string | null;
}

export interface RecepcionCreate {
  fecha: string; // ISO
  numero?: string | null;
  formaPagoId?: number | null;
  lineas: RecepcionLinea[];
}

export interface ProveedorLite { id: number; nombre: string; }

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private http = inject(HttpClient);
  // Nota: environment.apiBase usualmente es ".../api"
  private API = `${environment.apiBase}/PedidosProveedores`;

  // ------- Listar (filtros opcionales) -------
  list(params?: {
    proveedorId?: number;
    estado?: EstadoPedidoProveedor;
    desde?: string; // ISO
    hasta?: string; // ISO
  }): Observable<PedidoListItem[]> {
    let p = new HttpParams().set('page', '1').set('pageSize', '1000');
    if (params?.proveedorId) p = p.set('proveedorId', String(params.proveedorId));
    if (params?.estado) p = p.set('estado', params.estado);
    if (params?.desde) p = p.set('desde', params.desde);
    if (params?.hasta) p = p.set('hasta', params.hasta);
    return this.http.get<PedidoListItem[]>(this.API, { params: p });
  }

  getById(id: number): Observable<PedidoFull> {
    return this.http.get<PedidoFull>(`${this.API}/${id}`);
  }

  create(body: PedidoCreate): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.API, body);
  }

  addLinea(id: number, linea: PedidoDetalleCreate): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.API}/${id}/detalle`, linea);
  }

  updateLinea(id: number, detalleId: number, linea: PedidoDetalleCreate): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}/detalle/${detalleId}`, linea);
  }

  deleteLinea(id: number, detalleId: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/detalle/${detalleId}`);
  }

  enviar(id: number): Observable<void> {
    return this.http.post<void>(`${this.API}/${id}/enviar`, {});
  }

  aprobar(id: number): Observable<void> {
    return this.http.post<void>(`${this.API}/${id}/aprobar`, {});
  }

  cancelar(id: number): Observable<void> {
    return this.http.post<void>(`${this.API}/${id}/cancelar`, {});
  }

  recepcion(id: number, body: RecepcionCreate): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.API}/${id}/recepciones`, body);
  }

  // ------- Auxiliar: proveedores para combo -------
  listProveedores(term?: string): Observable<ProveedorLite[]> {
    // Reutiliza tu endpoint de Proveedores; ajusta si tu ruta difiere.
    let params = new HttpParams().set('soloActivos', 'true').set('take', 100);
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<ProveedorLite[]>(`${environment.apiBase}/Proveedores`, { params });
  }
}
