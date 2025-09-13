import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Categoria {
  id: number;
  nombre: string;
  descripcion: string;
  activo: boolean;
}
interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Categorias`;

  list(soloActivos: boolean = false, term?: string): Observable<Categoria[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<Categoria[]>(this.API, { params });
  }

  getById(id: number): Observable<Categoria> {
    return this.http.get<Categoria>(`${this.API}/${id}`);
  }

  create(categoria: Omit<Categoria, 'id'>): Observable<Categoria> {
    return this.http.post<Categoria>(this.API, categoria);
  }

  // El backend devuelve 204 NoContent
  update(id: number, categoria: Partial<Categoria>): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, categoria);
  }

  // PATCH correcto del backend
  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  // DELETE (204 NoContent)
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
