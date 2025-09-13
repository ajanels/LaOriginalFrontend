import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Proveedor {
  id: number;
  nombre: string;
  nit: string;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
  activo: boolean;
}

interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Proveedores`;

  list(soloActivos: boolean = false, term?: string): Observable<Proveedor[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<Proveedor[]>(this.API, { params });
  }

  getById(id: number): Observable<Proveedor> {
    return this.http.get<Proveedor>(`${this.API}/${id}`);
  }

  create(dto: Omit<Proveedor, 'id'>): Observable<Proveedor> {
    // Para Create, el backend es case-insensitive; no hace falta mapear claves.
    return this.http.post<Proveedor>(this.API, dto);
  }

  update(id: number, dto: Partial<Proveedor>): Observable<void> {
    // Mapear a las claves exactas esperadas por el backend (DTO con PascalCase)
    const body: any = {
      Id: id,
      Nombre: dto.nombre,
      NIT: dto.nit,
      Contacto: dto.contacto,
      Telefono: dto.telefono,
      Email: dto.email,
      Direccion: dto.direccion,
      Notas: dto.notas,
      Activo: dto.activo
    };
    return this.http.put<void>(`${this.API}/${id}`, body);
  }

  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
