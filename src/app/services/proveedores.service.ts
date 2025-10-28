import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProveedorItem {
  id: number;
  nombre: string;
  activo: boolean;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
}

interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Proveedores`;

  /** Listado con filtros */
  list(soloActivos: boolean = false, term?: string): Observable<ProveedorItem[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<ProveedorItem[]>(this.API, { params });
  }

  getById(id: number): Observable<ProveedorItem> {
    return this.http.get<ProveedorItem>(`${this.API}/${id}`);
  }

  /** Crear: envía solo campos básicos (nombre/activo) para máxima compatibilidad */
  create(dto: { nombre: string; activo: boolean }): Observable<ProveedorItem> {
    return this.http.post<ProveedorItem>(this.API, dto);
  }

  /** Actualizar: el backend usualmente requiere { id, ...campos } */
  update(id: number, dto: { nombre: string; activo: boolean }): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, { id, ...dto });
  }

  /** Activar / desactivar (si tu backend expone PATCH /estado como FormasPago) */
  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
