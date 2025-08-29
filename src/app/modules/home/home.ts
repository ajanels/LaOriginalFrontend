import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  firstName = 'Usuario';

  ngOnInit(): void {
    this.firstName = this.auth.getFirstName() || 'Usuario';

    const loginSuccess = localStorage.getItem('loginSuccess');
    if (loginSuccess) {
      Swal.fire({
        icon: 'success',
        title: `¡Bienvenido, ${this.firstName}!`,
        text: 'Inicio de sesión exitoso',
        width: '500px',
        padding: '2em',
        timer: 2500,
        showConfirmButton: false,
      });
      localStorage.removeItem('loginSuccess');
    }
  }
}
