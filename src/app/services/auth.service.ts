import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  of,
  switchMap,
  tap,
  catchError,
  map,
} from 'rxjs';

export interface UserLite {
  PrimerNombre?: string;
  primerNombre?: string;
  firstName?: string;
  given_name?: string;
  nombre?: string;
  name?: string;

  FotoUrl?: string;
  fotoUrl?: string;
  fotoURL?: string;
  photoUrl?: string;
  avatarUrl?: string;
  picture?: string;
  imageUrl?: string;

  [k: string]: any;
}

interface LoginResponse {
  token: string;
  user?: UserLite;
  usuario?: UserLite;
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private API_BASE = 'https://localhost:7140/api';
  private AUTH_URL = `${this.API_BASE}/Auth`;

  private TOKEN_KEY = 'authToken';
  private USER_KEY  = 'authUser';

  private _user$ = new BehaviorSubject<UserLite | null>(this.readUser());
  user$ = this._user$.asObservable();

  private logPayloadOnce = false;

  constructor(private http: HttpClient) {
    const stored = this.readUser();
    if (stored) {
      const norm = this.normalizeUser(stored);
      if (norm) this.setUser(norm);
    }

    if (!this._user$.value && this.getToken()) {
      const u = this.userFromToken(this.getToken()!);
      if (u) this.setUser(u);
    }
  }

  login(username: string, password: string): Observable<boolean> {
    return this.http.post<LoginResponse>(`${this.AUTH_URL}/login`, { username, password }).pipe(
      tap(res => {
        if (res?.token) {
          localStorage.setItem(this.TOKEN_KEY, res.token);
          const raw = res.user ?? res.usuario ?? this.userFromToken(res.token) ?? null;
          const u = this.normalizeUser(raw);
          if (u) this.setUser(u);
        }
      }),
      switchMap(() => {
        if (this._user$.value) return of(true);
        return this.fetchProfile().pipe(
          tap(u => u && this.setUser(this.normalizeUser(u)!)),
          map(() => true),
          catchError(() => of(true))
        );
      })
    );
  }

  private fetchProfile(): Observable<UserLite> {
    const token = this.getToken();
    if (!token) return of(null as unknown as UserLite);
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<UserLite>(`${this.AUTH_URL}/me`, { headers });
  }

  getToken(): string | null { return localStorage.getItem(this.TOKEN_KEY); }
  isAuthenticated(): boolean { return !!this.getToken(); }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._user$.next(null);
  }


  private normalizeUser(u: any | null): UserLite | null {
    if (!u) return null;

    const first =
      u.PrimerNombre ??
      u.primerNombre ??
      u.firstName ??
      u.given_name ??
      u.nombre ??
      u.name ??
      '';

    const photo =
      u.FotoUrl ??
      u.fotoUrl ??
      u.fotoURL ??
      u.photoUrl ??
      u.avatarUrl ??
      u.picture ??
      u.imageUrl ??
      null;

    const normalized: UserLite = { ...u };
    if (first) normalized.PrimerNombre = String(first).trim().split(/\s+/)[0];
    if (photo) normalized.FotoUrl = photo;

    return normalized;
  }

  getFirstName(u: UserLite | null = this._user$.value): string {
    if (!u) return '';
    const full =
      u.PrimerNombre ??
      u.primerNombre ??
      u.firstName ??
      u.given_name ??
      u.nombre ??
      u.name ??
      '';
    return full ? String(full).trim().split(/\s+/)[0] : '';
  }

  getPhotoUrl(u: UserLite | null = this._user$.value): string | null {
    if (!u) return null;
    const keys = ['FotoUrl','fotoUrl','fotoURL','photoUrl','avatarUrl','picture','imageUrl'] as const;
    for (const k of keys) {
      const v = (u as any)[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return null;
  }

  setUser(u: UserLite) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(u));
    this._user$.next(u);
  }

  private readUser(): UserLite | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private userFromToken(token: string): UserLite | null {
    try {
      const p: any = this.decodeJwt(token);

      if (!this.logPayloadOnce) {
        this.logPayloadOnce = true;
        console.debug('[Auth] JWT payload:', p);
      }

      const given =
        p?.PrimerNombre ??
        p?.primerNombre ??
        p?.firstName ??
        p?.given_name ??
        p?.nombre ??
        p?.name ??
        p?.unique_name ??
        p?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ??
        p?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];

      const picture = p?.picture || p?.FotoUrl || p?.fotoUrl || null;

      if (!given && !picture) return null;

      const first = given ? String(given).trim().split(/\s+/)[0] : '';
      return this.normalizeUser({ PrimerNombre: first, FotoUrl: picture || undefined });
    } catch {
      return null;
    }
  }

  private decodeJwt<T = any>(jwt: string): T {
    const part = jwt.split('.')[1];
    if (!part) throw new Error('Invalid JWT');
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '==='.slice((base64.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json) as T;
  }
}
