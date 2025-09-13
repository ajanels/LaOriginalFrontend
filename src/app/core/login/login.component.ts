import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
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

  constructor(private auth: AuthService, private router: Router) {}

  onLogin() {
    this.errorMessage = '';
    if (!this.username || !this.password) {
      this.errorMessage = 'Ingresa usuario y contraseña.';
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
        this.router.navigate(['/home']);
      },
      error: (err) => {
        this.loading = false;
        Swal.close();
        const msg =
          err?.error?.detail ||
          err?.error?.title ||
          err?.error ||
          'Credenciales incorrectas, inténtelo de nuevo.';
        this.errorMessage = typeof msg === 'string' ? msg : 'Error de autenticación';
      },
    });
  }
}
