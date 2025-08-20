import { Component, OnInit } from '@angular/core';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit {
  ngOnInit(): void {
    const loginSuccess = localStorage.getItem('loginSuccess');

    if (loginSuccess) {
      Swal.fire({
        icon: 'success',
        title: '¡Bienvenido!',
        text: 'Inicio de sesión exitoso',
        width: '500px',     // Más ancho
        padding: '2em',     // Más espacio
        timer: 2500,        // Desaparece solo
        showConfirmButton: false
      });

      // eliminamos el flag para que no aparezca de nuevo al refrescar
      localStorage.removeItem('loginSuccess');
    }
  }
}
