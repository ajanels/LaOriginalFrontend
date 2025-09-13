import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EstadoItem {
  id: number;
  tipo: string;
  nombre: string;
  activo: boolean;
  notas?: string | null; // solo viene en GET by id
}

export interface EstadoUpsertDto {
  tipo: string;
  nombre: string;
  activo: boolean;
  notas?: string | null;
}

@Injectable({ providedIn: 'root' })
export class EstadosService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/Estados`;

  // Lista (opcionalmente por tipo). El backend no filtra por 'activo'.
  list(tipo?: string): Observable<EstadoItem[]> {
    let params = new HttpParams();
    if (tipo && tipo.trim()) params = params.set('tipo', tipo.trim());
    return this.http.get<EstadoItem[]>(this.API, { params });
  }

  getById(id: number): Observable<EstadoUpsertDto> {
    return this.http.get<EstadoUpsertDto>(`${this.API}/${id}`);
  }

  create(dto: EstadoUpsertDto): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.API, dto);
  }

  update(id: number, dto: EstadoUpsertDto): Observable<void> {
    return this.http.put<void>(`${this.API}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
