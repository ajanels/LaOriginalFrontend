import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Marca {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
}
interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class MarcasService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Marcas`;

  list(soloActivos: boolean = false, term?: string): Observable<Marca[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<Marca[]>(this.API, { params });
  }

  getById(id: number): Observable<Marca> {
    return this.http.get<Marca>(`${this.API}/${id}`);
  }

  create(dto: Omit<Marca, 'id'>): Observable<Marca> {
    return this.http.post<Marca>(this.API, dto);
  }

  update(id: number, dto: Partial<Marca>): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, { id, ...dto });
  }

  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
