import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-cambiar-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './change-password.html',
  styleUrls: ['./change-password.css']
})
export class ChangePasswordComponent {
  current = '';
  next = '';
  confirm = '';

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    if (!this.current || !this.next || !this.confirm) {
      Swal.fire('Campos vacíos', 'Completa todos los campos', 'warning');
      return;
    }

    if (this.next !== this.confirm) {
      Swal.fire('Error', 'La confirmación no coincide', 'error');
      return;
    }

    this.auth.changePassword(this.current, this.next).subscribe({
      next: () => {
        Swal.fire('Listo', 'Contraseña actualizada', 'success')
          .then(() => this.router.navigate(['/home']));
      },
      error: err => {
        const msg = err?.error?.message ?? 'No se pudo actualizar';
        Swal.fire('Error', msg, 'error');
      }
    });
  }
}
