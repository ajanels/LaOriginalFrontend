import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductoListItem {
  id: number;
  nombre: string;
  codigo?: string | null;
  categoria?: string | null;
  categoriaId?: number | null;     // opcional si el backend lo provee
  activo: boolean;
  presentaciones: number;
  fotoUrl?: string | null;
}

export interface ProductoDetail {
  id: number;
  nombre: string;
  codigo?: string | null;
  activo: boolean;
  categoriaId?: number | null;
  categoria?: string | null;
  fotoUrl?: string | null;
  proveedorId?: number | null;
  precioCompraDefault?: number | null;
  precioVentaDefault?: number | null;
}

export interface ProductoCreatePayload {
  nombre: string;
  categoriaId: number;
  proveedorId: number;
  fotoUrl: string;
  precioCompraDefault: number;
  precioVentaDefault: number;
  activo: boolean;
}

export interface ProductoUpdatePayload {
  id: number;
  nombre: string;
  categoriaId: number;
  fotoUrl: string;
  activo: boolean;
}

export interface ProductoPreciosUpdatePayload {
  precioCompraDefault: number;
  precioVentaDefault: number;
}

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Productos`;

  list(params?: {
    term?: string;
    categoriaId?: number | null;
    soloActivos?: boolean;
  }): Observable<ProductoListItem[]> {
    let p = new HttpParams();
    if (params?.term) p = p.set('term', params.term);
    if (params?.categoriaId != null) p = p.set('categoriaId', String(params.categoriaId));
    if (params?.soloActivos != null) p = p.set('soloActivos', String(params.soloActivos));
    return this.http.get<ProductoListItem[]>(this.API, { params: p });
  }

  getById(id: number): Observable<ProductoDetail> {
    return this.http.get<ProductoDetail>(`${this.API}/${id}`);
  }

  create(dto: ProductoCreatePayload): Observable<ProductoDetail> {
    return this.http.post<ProductoDetail>(this.API, dto);
  }

  update(id: number, dto: ProductoUpdatePayload): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, dto);
  }

  /** Actualizar precios por defecto de la presentación principal */
  updateDefaultPrices(id: number, dto: ProductoPreciosUpdatePayload): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}/precios-default`, dto);
  }

  /** Toggle de estado activo/inactivo */
  toggleActivo(id: number, activo: boolean): Observable<{ id: number; activo: boolean }> {
    return this.http.patch<{ id: number; activo: boolean }>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  uploadImage(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ url: string }>(`${this.API}/imagen`, form);
  }
}
