import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UnidadMedida {
  id: number;
  nombre: string;
  simbolo: string;
  descripcion?: string | null;
  activo: boolean;
}

interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class UnidadesMedidaService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/UnidadesMedida`;

  list(soloActivos: boolean = false, term?: string): Observable<UnidadMedida[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<UnidadMedida[]>(this.API, { params });
  }

  getById(id: number): Observable<UnidadMedida> {
    return this.http.get<UnidadMedida>(`${this.API}/${id}`);
  }

  create(dto: Omit<UnidadMedida, 'id'>): Observable<UnidadMedida> {
    return this.http.post<UnidadMedida>(this.API, dto);
  }

  update(id: number, dto: Partial<UnidadMedida>): Observable<void> {
    // Mapeo a PascalCase por si el backend lo exige estrictamente.
    const body: any = {
      Id: id,
      Nombre: dto.nombre,
      Simbolo: dto.simbolo,
      Descripcion: dto.descripcion,
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
