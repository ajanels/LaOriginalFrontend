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
  styleUrls: ['./login.css'],
})
export class LoginComponent {
  username = '';
  password = '';
  errorMessage = '';

  constructor(private auth: AuthService, private router: Router) {}

  onLogin() {
    this.errorMessage = '';

    Swal.fire({
      title: 'Validando credenciales...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    this.auth.login(this.username, this.password).subscribe({
      next: (ok) => {
        Swal.close();
        if (ok) {
          localStorage.setItem('loginSuccess', 'true');
          this.router.navigate(['/home']);
        } else {
          this.errorMessage = 'No se pudo iniciar sesión.';
        }
      },
      error: () => {
        Swal.close();
        this.errorMessage = 'Credenciales incorrectas, inténtelo de nuevo.';
      },
    });
  }
}
