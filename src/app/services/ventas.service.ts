import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductoDto {
  presentacionId: number;
  productoId: number;
  producto: string;
  productoCodigo?: string;
  fotoUrl?: string;
  cantidad: number;            // stock físico (no descuenta reservas)
  minimo?: number;
  bajoMinimo: boolean;
  precioVenta?: number | null;
}

// ⇩ NUEVO: DTO que devuelve /pedidosclientes/disponible
export interface StockDisponibleDto {
  presentacionId: number;
  stock: number;
  reservado: number;
  disponible: number;
  precioVenta?: number | null;
}

export interface VentaItemCreate {
  presentacionId: number;
  cantidad: number;
  precioUnitario: number;
  descuentoUnitario?: number;
  notas?: string;
}

export interface VentaCreate {
  clienteId?: number;
  formaPagoId?: number;
  observaciones?: string;
  items: VentaItemCreate[];
}

export interface FormaPagoItem {
  id: number;
  nombre: string;
  requiereReferencia?: boolean;
}

export interface ClienteItem {
  id: number;
  nombre: string;
}

export interface VentaDetailDto {
  id: number;
  fecha: string;
  clienteId?: number;
  clienteNombre?: string;
  serie?: string;
  numero?: string;
  observaciones?: string;
  subtotal: number;
  descuento: number;
  total: number;
  estado: string;
  anulada: boolean;
  formaPagoId?: number;
  formaPagoNombre?: string;
  usuarioId?: number;
  usuarioNombre?: string;
  items: Array<{
    id: number;
    presentacionId: number;
    presentacionNombre: string;
    productoNombre: string;
    cantidad: number;
    precioUnitario: number;
    descuentoUnitario: number;
    totalLinea: number;
    notas?: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class VentasService {
  private http = inject(HttpClient);
  private api = environment.apiBase;

  /** Catálogo “base”: stock físico por presentación (NO descuenta reservas) */
  listarProductos(term?: string): Observable<ProductoDto[]> {
    let params = new HttpParams();
    if (term?.trim()) params = params.set('term', term.trim());
    return this.http.get<ProductoDto[]>(`${this.api}/inventario/stock`, { params });
  }

  /** ⇩ NUEVO: disponibilidad real (stock - reservas), en batch */
  disponibilidad(ids: number[], excluirPedidoId?: number): Observable<StockDisponibleDto[]> {
    if (!ids || ids.length === 0) return of([]);

    // evitamos URLs largas: pedimos en bloques de 50
    const chunk = <T>(arr: T[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

    const calls = chunk(ids, 50).map(block => {
      let params = new HttpParams();
      block.forEach(id => params = params.append('ids', String(id)));
      if (excluirPedidoId != null) params = params.set('excluirPedidoId', String(excluirPedidoId));
      return this.http.get<StockDisponibleDto[]>(`${this.api}/pedidosclientes/disponible`, { params });
    });

    return forkJoin(calls).pipe(map(parts => parts.flat()));
  }

  crearVenta(dto: VentaCreate): Observable<{ id: number; message?: string }> {
    return this.http.post<{ id: number; message?: string }>(`${this.api}/ventas`, dto);
  }

  listarFormasPago(onlyActive = true): Observable<FormaPagoItem[]> {
    let params = new HttpParams().set('soloActivas', String(onlyActive));
    return this.http.get<FormaPagoItem[]>(`${this.api}/formas-pago`, { params });
  }

  buscarClientes(term: string): Observable<ClienteItem[]> {
    const params = new HttpParams().set('term', term || '');
    return this.http.get<ClienteItem[]>(`${this.api}/clientes`, { params });
  }

  getById(id: number): Observable<VentaDetailDto> {
    return this.http.get<VentaDetailDto>(`${this.api}/ventas/${id}`);
  }
}
