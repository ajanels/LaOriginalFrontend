import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

type PwdRules = { len: boolean; upper: boolean; lower: boolean; digit: boolean; symbol: boolean; };

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

  // toggles para mostrar/ocultar
  showCurrent = false;
  showNext = false;
  showConfirm = false;

  // checklist dinámico (para "next")
  pwdRules: PwdRules = { len: false, upper: false, lower: false, digit: false, symbol: false };

  constructor(private auth: AuthService, private router: Router) {}

  // ===== Utilidades de password =====
  private computePwdRules(v: string): PwdRules {
    return {
      len: v.length >= 8 && v.length <= 64,
      upper: /[A-Z]/.test(v),
      lower: /[a-z]/.test(v),
      digit: /\d/.test(v),
      symbol: /[^\w\s]/.test(v),
    };
  }
  onNextInput(): void {
    this.pwdRules = this.computePwdRules(this.next ?? '');
  }
  private missingRuleMessages(r: PwdRules): string[] {
    const msgs: string[] = [];
    if (!r.len)   msgs.push('8–64 caracteres');
    if (!r.upper) msgs.push('1 mayúscula');
    if (!r.lower) msgs.push('1 minúscula');
    if (!r.digit) msgs.push('1 número');
    if (!r.symbol)msgs.push('1 símbolo');
    return msgs;
  }

  // ===== Envío =====
  submit(): void {
    if (!this.current || !this.next || !this.confirm) {
      Swal.fire('Campos vacíos', 'Completa todos los campos', 'warning');
      return;
    }

    // validar checklist
    const rules = this.computePwdRules(this.next);
    const missing = this.missingRuleMessages(rules);
    if (missing.length) {
      const html = `<ul style="text-align:left;margin:0 0 0 18px;padding:0;">${missing.map(m => `<li>${m}</li>`).join('')}</ul>`;
      Swal.fire('La nueva contraseña no cumple los requisitos', html, 'warning');
      return;
    }

    // confirmar iguales
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
