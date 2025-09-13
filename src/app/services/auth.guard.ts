import { inject } from '@angular/core';
import {
  CanMatchFn,
  CanActivateChildFn,
  Router,
  RouterStateSnapshot,
  UrlTree
} from '@angular/router';
import Swal from 'sweetalert2';
import { AuthService } from './auth.service';

function requireLogin(url: string): true | UrlTree {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: url } });
  }
  return true;
}

function checkRoles(routeData: any): true | UrlTree {
  const auth = inject(AuthService);
  const router = inject(Router);

  const required = routeData?.['roles'] as string[] | undefined;
  if (required?.length && !auth.hasRole(...required)) {
    Swal.fire('Acceso denegado', 'No tienes permisos para acceder', 'error');
    return router.createUrlTree(['/home']);
  }
  return true;
}

export const authGuardMatch: CanMatchFn = (route, segments) => {
  const url = '/' + segments.map(s => s.path).join('/');
  return requireLogin(url);
};

export const authGuard: CanActivateChildFn = (route, state: RouterStateSnapshot) => {
  const login = requireLogin(state.url);
  if (login !== true) return login;

  const roles = checkRoles(route.data);
  if (roles !== true) return roles;

  return true;
};
