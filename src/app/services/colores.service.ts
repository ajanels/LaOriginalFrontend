import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ColorItem {
  id: number;
  nombre: string;
  hex?: string | null;
  activo: boolean;
  notas?: string | null;
}
interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class ColoresService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Colores`;

  list(soloActivos: boolean = false, term?: string): Observable<ColorItem[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<ColorItem[]>(this.API, { params });
  }

  getById(id: number): Observable<ColorItem> {
    return this.http.get<ColorItem>(`${this.API}/${id}`);
  }

  create(c: Omit<ColorItem, 'id'|'activo'> & { activo?: boolean }): Observable<ColorItem> {
    return this.http.post<ColorItem>(this.API, c);
  }

  update(id: number, c: Partial<ColorItem>): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, c);
  }

  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
