import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import Swal from 'sweetalert2';
import { AuthService } from '../../services/auth.service';

@Injectable({ providedIn: 'root' })
class RoleGuardService {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean {
    // 1) Debe existir sesión
    if (!this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/');
      return false;
    }

    // 2) Roles requeridos (si no hay, pasa)
    const roles: string[] | undefined = route.data?.['roles'];
    if (!roles || roles.length === 0) return true;

    // 3) Verificación de rol
    const ok = this.auth.hasRole(...roles);
    if (ok) return true;

    const actual = this.auth.getCurrentRole() || '(sin rol)';
    Swal.fire({
      icon: 'error',
      title: 'Acceso denegado',
      text: `No tienes permisos para acceder a esta ruta. Tu rol actual es: ${actual}`,
    }).then(() => this.router.navigateByUrl('/home'));
    return false;
  }
}

export const roleGuard: CanActivateFn = (route, state) =>
  inject(RoleGuardService).canActivate(route, state);
