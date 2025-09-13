import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FormaPagoItem {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  requiereReferencia: boolean;
  esCredito: boolean;
}

interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class FormasPagoService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/FormasPago`;

  list(soloActivos: boolean = false, term?: string): Observable<FormaPagoItem[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos));
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<FormaPagoItem[]>(this.API, { params });
  }

  getById(id: number): Observable<FormaPagoItem> {
    return this.http.get<FormaPagoItem>(`${this.API}/${id}`);
  }

  create(dto: Omit<FormaPagoItem, 'id'>): Observable<FormaPagoItem> {
    return this.http.post<FormaPagoItem>(this.API, dto);
  }

  update(id: number, dto: Partial<FormaPagoItem>): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, { id, ...dto });
  }

  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
