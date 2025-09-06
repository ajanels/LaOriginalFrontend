// src/app/services/auth.guard.ts
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { inject } from '@angular/core';
import Swal from 'sweetalert2';
import { AuthService } from './auth.service';

/**
 * Guard que:
 * 1) Exige sesión activa.
 * 2) Valida roles si la ruta define data: { roles: ['Admin', ...] }.
 */
export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // 1) Requiere login
  if (!auth.isLoggedIn()) {
    router.navigateByUrl('/login');
    return false;
  }

  // 2) Roles (opcional)
  const required = route.data?.['roles'] as string[] | undefined;
  if (required?.length) {
    const ok = auth.hasRole(...required);
    if (!ok) {
      Swal.fire('Acceso denegado', 'No tienes permisos para acceder a esta ruta', 'error');
      router.navigateByUrl('/'); // o a una página 403 si la tienes
      return false;
    }
  }

  return true;
};
