import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Rol {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  // Campo opcional por si el backend lo manda (string "Activo"/"Inactivo"):
  estado?: string;
}

interface ToggleResponse { id: number; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class RolesService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/roles`;

  // GET /api/roles?soloActivos=true|false
  list(soloActivos: boolean = false): Observable<Rol[]> {
    const params = new HttpParams().set('soloActivos', String(soloActivos));
    return this.http.get<Rol[]>(this.API, { params });
  }

  getById(id: number): Observable<Rol> {
    return this.http.get<Rol>(`${this.API}/${id}`);
  }

  create(dto: Omit<Rol, 'id'>): Observable<Rol> {
    // POST acepta camelCase; si tu backend exigiera PascalCase, avísame y lo mapeamos.
    return this.http.post<Rol>(this.API, dto);
  }

  update(id: number, dto: Partial<Rol>): Observable<void> {
    // Para el PUT mapeamos a PascalCase (RolUpdateDto)
    const body: any = {
      Id: id,
      Nombre: dto.nombre,
      Descripcion: dto.descripcion,
      Activo: dto.activo
    };
    return this.http.put<void>(`${this.API}/${id}`, body);
  }

  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    // PATCH /api/roles/{id}/estado  { activo: boolean }
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
