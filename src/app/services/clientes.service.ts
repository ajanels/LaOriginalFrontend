import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Cliente {
  id: number;
  nombre: string;
  nit: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
}

interface ToggleResponse { id: number; nombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Clientes`;

  list(soloActivos: boolean = false, term?: string, take: number = 100): Observable<Cliente[]> {
    let params = new HttpParams().set('soloActivos', String(soloActivos)).set('take', take);
    if (term && term.trim()) params = params.set('term', term.trim());
    return this.http.get<Cliente[]>(this.API, { params });
  }

  getById(id: number): Observable<Cliente> {
    return this.http.get<Cliente>(`${this.API}/${id}`);
  }

  create(cliente: Omit<Cliente, 'id'>): Observable<Cliente> {
    // Backend devuelve 201 con objeto resumido (ListDto). Tipamos a Cliente compatible.
    return this.http.post<Cliente>(this.API, cliente);
  }

  update(id: number, cliente: Partial<Cliente>): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, cliente);
  }

  toggleActivo(id: number, activo: boolean): Observable<ToggleResponse> {
    return this.http.patch<ToggleResponse>(`${this.API}/${id}/estado`, { activo });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
