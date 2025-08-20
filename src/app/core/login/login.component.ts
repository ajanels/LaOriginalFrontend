import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';
  errorMessage: string = '';

  constructor(private authService: AuthService, private router: Router) {}

  onLogin() {
    this.errorMessage = '';

    // Mostrar pantalla de carga mientras valida
    Swal.fire({
      title: 'Validando credenciales...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('loginSuccess', 'true'); // 👉 Bandera para Home

        Swal.close(); // cerramos loading

        // Redirigimos directamente al home
        this.router.navigate(['/home']);
      },
      error: () => {
        Swal.close();
        this.errorMessage = 'Credenciales incorrectas, inténtelo de nuevo.';
      }
    });
  }
}
