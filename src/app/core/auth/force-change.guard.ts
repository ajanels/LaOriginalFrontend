// src/app/core/auth/force-change.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';

export const forceChangeGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Permitir la pantalla de cambio de contraseña
  if (state.url.startsWith('/cambiar-password')) return true;

  // Si el usuario debe cambiar la contraseña, redirigir
  if (auth.isPasswordChangeRequired()) {
    return router.createUrlTree(['/cambiar-password']);
  }

  return true;
};
