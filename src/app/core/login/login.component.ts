import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

// Desde core/login hasta services: ../../
import { AuthService, LoginResponse } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent {
  username = '';
  password = '';
  errorMessage = '';
  loading = false;

  showPassword = false;

  constructor(private auth: AuthService, private router: Router) {}

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onLogin(): void {
    this.errorMessage = '';

    if (!this.username || !this.password) {
      this.errorMessage = 'Ingresa usuario y contraseña.';
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Ingresa usuario y contraseña.',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    this.loading = true;
    Swal.fire({
      title: 'Validando credenciales...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    this.auth.login(this.username, this.password).subscribe({
      next: (_res: LoginResponse) => {
        this.loading = false;
        Swal.close();

        if (this.auth.isPasswordChangeRequired()) {
          this.router.navigate(['/cambiar-password']);
        } else {
          this.router.navigate(['/home']);
        }
      },
      error: (err: any) => {
        this.loading = false;
        Swal.close();

        const baseMsg =
          err?.status === 0
            ? 'No se pudo conectar con el servidor. Revisa tu conexión.'
            : (err?.error?.detail ||
               err?.error?.title ||
               err?.error?.message ||
               err?.error ||
               'Credenciales incorrectas, inténtalo de nuevo.');

        this.errorMessage = typeof baseMsg === 'string'
          ? baseMsg
          : 'Error de autenticación';

        Swal.fire({
          icon: 'error',
          title: 'Error de autenticación',
          text: this.errorMessage,
          confirmButtonText: 'Entendido',
        });
      },
    });
  }
}
