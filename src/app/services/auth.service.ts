import { Injectable, computed, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id?: number;
  username?: string;
  email?: string;
  rol?: { id: number; nombre: string } | null;

  PrimerNombre?: string;
  primerNombre?: string;
  nombre?: string;
  FotoUrl?: string;
  fotoUrl?: string;
  picture?: string;
  imageUrl?: string;

  RolId?: number;    rolId?: number;
  RolNombre?: string; rolNombre?: string;

  mustChangePassword?: boolean; // flag del backend
}

export interface LoginRequest {
  usernameOrEmail?: string;
  username?: string;
  email?: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresIn?: number;
  user?: AuthUser;
  mustChangePassword?: boolean; // top-level
}

const TOKEN_KEY = 'laoriginal.jwt';
const USER_KEY  = 'laoriginal.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private API_BASE = environment.apiBase;
  private AUTH_URL = `${this.API_BASE}/auth`;

  private _token = signal<string | null>(this.loadToken());
  private _user  = signal<AuthUser | null>(this.loadUser());

  token      = computed(() => this._token());
  user       = computed(() => this._user());
  isLoggedIn = computed(() => !!this._token());
  isPasswordChangeRequired = computed(() => !!this._user()?.mustChangePassword);

  // ✅ Constructor: consolida mustChangePassword desde el JWT al iniciar la app
  constructor() {
    const t = this._token();
    const u = this._user();
    const fromJwt = this.readJwtFlag(t);
    if (u && (u as any).mustChangePassword == null) {
      (u as any).mustChangePassword = fromJwt;
      this.setUser(u); // persiste nuevamente con el flag consolidado
    }
  }

  // === helper: leer claim del JWT ===
  private readJwtFlag(token?: string | null): boolean {
    if (!token) return false;
    try {
      const payload = token.split('.')[1];
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const v = json['pwd_change_required'];
      return v === '1' || v === 1 || v === true || v === 'true';
    } catch {
      return false;
    }
  }

  // ===== LOGIN =====
  login(body: LoginRequest): Observable<LoginResponse>;
  login(username: string, password: string): Observable<LoginResponse>;
  login(a: LoginRequest | string, b?: string): Observable<LoginResponse> {
    const uoe = typeof a === 'string' ? a : (a.usernameOrEmail ?? a.username ?? a.email ?? '');
    const pwd = typeof a === 'string' ? (b as string) : a.password;

    const payload: LoginRequest = { usernameOrEmail: uoe, username: uoe, email: uoe, password: pwd };

    return this.http.post<LoginResponse>(`${this.AUTH_URL}/login`, payload).pipe(
      tap(res => {
        if (res?.token) this.setToken(res.token);

        if (res?.user) {
          const u = this.normalizeUser(res.user);

          // Consolidar flag desde 3 fuentes (respuesta, user y JWT)
          const flag =
            (res as any).mustChangePassword ??
            (res.user as any).mustChangePassword ??
            this.readJwtFlag(res.token) ??
            false;

          (u as any).mustChangePassword = !!flag;
          this.setUser(u);
        } else {
          this.me().subscribe({ next: u => this.setUser(this.normalizeUser(u)) });
        }
      })
    );
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.AUTH_URL}/me`, { headers: this.authHeaders() })
      .pipe(tap(u => this.setUser(this.normalizeUser(u))));
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<{ ok: boolean; token: string }>(
      `${this.AUTH_URL}/change-password`,
      { currentPassword, newPassword },
      { headers: this.authHeaders() }
    ).pipe(tap(r => {
      if (r?.token) this.setToken(r.token);
      this.me().subscribe(); // refresca user y limpia mustChangePassword
    }));
  }

  logout(): void {
    this.setToken(null);
    this.setUser(null);
  }

  // ===== ROLES =====
  hasRole(...rolesPermitidos: string[]): boolean {
    const actual = this.getCurrentRole();
    if (!actual) return false;
    return rolesPermitidos.map(r => this.normalizeRole(r)).includes(actual);
  }

  getCurrentRole(): string {
    const u = this._user();
    const nombre =
      u?.rol?.nombre ??
      (u as any)?.RolNombre ?? (u as any)?.rolNombre ?? '';
    return this.normalizeRole(nombre);
  }

  private normalizeRole(r?: string): string {
    if (!r) return '';
    const plain = r.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
    if (plain === 'administrador') return 'admin';
    return plain;
  }

  // ===== Helpers UI =====
  getFirstName(u: AuthUser | null = this._user()): string {
    if (!u) return '';
    const full = u.PrimerNombre ?? u.primerNombre ?? u.nombre ?? u.username ?? '';
    return full ? String(full).trim().split(/\s+/)[0] : '';
  }

  getPhotoUrl(u: AuthUser | null = this._user()): string | null {
    if (!u) return null;
    const keys = ['FotoUrl', 'fotoUrl', 'picture', 'imageUrl'] as const;
    for (const k of keys) {
      const v = (u as any)[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return null;
  }

  // ===== Storage =====
  private setToken(t: string | null) {
    this._token.set(t);
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  }
  private setUser(u: AuthUser | null) {
    this._user.set(u);
    try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch {}
  }
  private loadToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  private loadUser(): AuthUser | null {
    try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) as AuthUser : null; } catch { return null; }
  }
  private authHeaders(): HttpHeaders {
    const t = this._token();
    return new HttpHeaders(t ? { Authorization: `Bearer ${t}` } : {});
  }

  // ===== Normalización del user =====
  private normalizeUser(u: AuthUser): AuthUser {
    const first = u.PrimerNombre ?? u.primerNombre ?? u.nombre ?? u.username ?? '';
    const foto  = u.FotoUrl ?? u.fotoUrl ?? u.picture ?? u.imageUrl ?? null;
    const rawName = (u as any).RolNombre ?? (u as any).rolNombre ?? null;
    const rawId   = (u as any).RolId     ?? (u as any).rolId     ?? null;
    const rol = u.rol ?? (rawName ? { id: Number(rawId ?? 0), nombre: String(rawName) } : null);

    return {
      ...u,
      PrimerNombre: first ? String(first).split(/\s+/)[0] : undefined,
      FotoUrl: foto ?? undefined,
      rol
    };
  }
}
