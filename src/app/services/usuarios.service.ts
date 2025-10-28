import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RolMini { id: number; nombre: string; }

export interface Usuario {
  id: number;
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido: string;
  segundoApellido?: string | null;
  username: string;
  email: string;
  celular: string;
  estado: string;
  fotoUrl?: string | null;
  rolId: number;
  rol?: RolMini | null;
  nit?: string;
  cui?: string;
  genero?: string;
  direccion?: string;
  fechaNacimiento?: string;
  fechaIngreso?: string;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private http = inject(HttpClient);
  private API = `${environment.apiBase}/usuarios`;

  list(): Observable<Usuario[]> { return this.http.get<Usuario[]>(this.API); }
  get(id: number): Observable<Usuario> { return this.http.get<Usuario>(`${this.API}/${id}`); }
  create(fd: FormData): Observable<Usuario> { return this.http.post<Usuario>(this.API, fd); }
  update(id: number, data: Partial<Usuario> & { id: number }): Observable<void> { return this.http.put<void>(`${this.API}/${id}`, data); }
  uploadPhoto(id: number, file: File): Observable<{ fotoUrl: string }> {
    const fd = new FormData(); fd.append('foto', file);
    return this.http.post<{ fotoUrl: string }>(`${this.API}/${id}/photo`, fd);
  }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.API}/${id}`); }
}
