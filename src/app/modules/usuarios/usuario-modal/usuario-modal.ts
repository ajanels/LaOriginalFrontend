import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
  ValidatorFn
} from '@angular/forms';
import Swal from 'sweetalert2';
import { UsuariosService, Usuario, UsuarioUpdatePayload } from '../../../services/usuarios.service';
import { RolesService, Rol } from '../../../services/roles.service';

export type ModalMode = 'create' | 'edit' | 'view';
type UsuarioWithRol = Usuario & { rolId?: number | null; rol?: { id: number; nombre: string } | null };

type PwdRules = { len: boolean; upper: boolean; lower: boolean; digit: boolean; symbol: boolean; };

@Component({
  standalone: true,
  selector: 'app-usuario-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './usuario-modal.html',
  styleUrls: ['./usuario-modal.css'],
})
export class UsuarioModalComponent implements OnInit {
  @Input() mode: ModalMode = 'create';
  @Input() usuario: UsuarioWithRol | null = null;
  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private api = inject(UsuariosService);
  private rolesApi = inject(RolesService);

  form!: FormGroup;
  photoFile: File | null = null;
  photoPreview: string | null = null;   // se usa también en EDIT
  roles: Rol[] = [];

  changePwd = false; // toggle para habilitar cambio de contraseña en edición

  // Rango de fechas (espejo de backend)
  minNac = '1900-01-01';
  maxNac = this.formatDate(this.addYears(new Date(), -15));
  minIng = '1990-01-01';
  maxIng = this.formatDate(new Date());

  // Checklist dinámico
  pwdRules: PwdRules = { len: false, upper: false, lower: false, digit: false, symbol: false };

  get isView()   { return this.mode === 'view'; }
  get isCreate() { return this.mode === 'create'; }
  get isEdit()   { return this.mode === 'edit';  }
  get initialLetter() {
    const n = (this.usuario?.primerNombre ?? '').trim();
    return n ? n.charAt(0).toUpperCase() : 'U';
  }

  // ===== Validadores a nivel formulario =====
  private businessDateRulesValidator: ValidatorFn = (fg: AbstractControl): ValidationErrors | null => {
    const fn = new Date(fg.get('fechaNacimiento')?.value || '');
    const fi = new Date(fg.get('fechaIngreso')?.value || '');

    const minFn = new Date(this.minNac);
    const maxFn = new Date(this.maxNac);
    const minFi = new Date(this.minIng);
    const maxFi = new Date(this.maxIng);

    const errors: any = {};
    if (isNaN(fn.getTime())) errors.fnInvalid = true;
    if (isNaN(fi.getTime())) errors.fiInvalid = true;

    if (!errors.fnInvalid && (fn < minFn || fn > maxFn)) errors.fnOutOfRange = true;
    if (!errors.fiInvalid && (fi < minFi || fi > maxFi)) errors.fiOutOfRange = true;

    if (!errors.fnInvalid && !errors.fiInvalid) {
      const fnPlus15 = new Date(fn); fnPlus15.setFullYear(fn.getFullYear() + 15);
      if (fi < fnPlus15) errors.fiBeforeMinAge = true;
    }
    return Object.keys(errors).length ? errors : null;
  };

  private passwordsMatchValidator: ValidatorFn = (fg: AbstractControl): ValidationErrors | null => {
    const p = fg.get('password')?.value;
    const p2 = fg.get('password2')?.value;
    if ((p ?? '') !== '' || (p2 ?? '') !== '') {
      return p === p2 ? null : { pwdMismatch: true };
    }
    return null;
  };

  ngOnInit(): void {
    this.form = this.fb.group({
      primerNombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      segundoNombre: ['', [Validators.maxLength(50)]],
      primerApellido: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      segundoApellido: ['', [Validators.maxLength(50)]],
      nit: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      cui: ['', [Validators.required, Validators.pattern(/^\d{13}$/)]],
      fechaNacimiento: ['', Validators.required],
      fechaIngreso: ['', Validators.required],
      celular: ['', [Validators.required, Validators.pattern(/^[2-7]\d{7}$/)]],
      genero: ['Masculino', Validators.required],
      estado: ['Activo', Validators.required],
      direccion: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      rolId: [null, Validators.required],
      password: [''],
      password2: [''],
    }, { validators: [this.businessDateRulesValidator, this.passwordsMatchValidator] });

    // normalizadores de dígitos
    this.form.get('nit')?.valueChanges.subscribe(v => this.form.get('nit')?.setValue(this.onlyDigits(v, 9), { emitEvent: false }));
    this.form.get('cui')?.valueChanges.subscribe(v => this.form.get('cui')?.setValue(this.onlyDigits(v, 13), { emitEvent: false }));
    this.form.get('celular')?.valueChanges.subscribe(v => this.form.get('celular')?.setValue(this.onlyDigits(v, 8), { emitEvent: false }));

    // checklist de password
    this.form.get('password')?.valueChanges.subscribe(v => this.pwdRules = this.computePwdRules(String(v ?? '')));
    this.pwdRules = this.computePwdRules(String(this.form.get('password')?.value ?? ''));

    this.rolesApi.list().subscribe({ next: list => this.roles = list });

    if (this.usuario && !this.isCreate) {
      const generoNormalizado = this.mapGeneroIn(this.usuario.genero);
      this.form.patchValue({
        primerNombre: this.usuario.primerNombre,
        segundoNombre: this.usuario.segundoNombre ?? '',
        primerApellido: this.usuario.primerApellido,
        segundoApellido: this.usuario.segundoApellido ?? '',
        nit: this.usuario.nit,
        cui: this.usuario.cui,
        fechaNacimiento: (this.usuario.fechaNacimiento ?? '').substring(0, 10),
        fechaIngreso: (this.usuario.fechaIngreso ?? '').substring(0, 10),
        celular: this.usuario.celular,
        genero: generoNormalizado,
        estado: this.usuario.estado,
        direccion: this.usuario.direccion,
        email: this.usuario.email,
        rolId: this.usuario.rolId ?? this.usuario.rol?.id ?? null,
      });
    }

    // Reglas de contraseña según modo
    if (this.isCreate) this.enablePasswordValidators(true);
    else this.enablePasswordValidators(false);

    // preview inicial si trae foto
    if (this.usuario?.fotoUrl) this.photoPreview = this.usuario.fotoUrl;

    if (this.isView) this.form.disable();
  }

  // ===== Helpers =====
  private onlyDigits(v: any, max: number) { return (String(v ?? '').replace(/\D+/g, '').slice(0, max)); }
  private mapGeneroIn(g: string | undefined): string {
    if (!g) return 'Masculino';
    if (g === 'M') return 'Masculino';
    if (g === 'F') return 'Femenino';
    return g;
  }
  private addYears(d: Date, years: number) { const nd = new Date(d); nd.setFullYear(d.getFullYear() + years); return nd; }
  private formatDate(d: Date) { const mm = String(d.getMonth() + 1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${mm}-${dd}`; }
  private computePwdRules(v: string): PwdRules {
    return { len: v.length >= 8 && v.length <= 64, upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), digit: /\d/.test(v), symbol: /[^\w\s]/.test(v) };
  }

  onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) {
      this.photoFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => this.photoPreview = reader.result as string;
      reader.readAsDataURL(this.photoFile);
    }
  }
  onImgError() { this.photoPreview = null; }

  toggleChangePwd() {
    this.changePwd = !this.changePwd;
    if (this.isEdit) this.enablePasswordValidators(this.changePwd);
    this.pwdRules = this.computePwdRules(String(this.form.get('password')?.value ?? ''));
  }

  private enablePasswordValidators(enable: boolean) {
    const pwd = this.form.get('password')!;
    const pwd2 = this.form.get('password2')!;
    if (enable) {
      pwd.setValidators([Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,64}$/)]);
      pwd2.setValidators([Validators.required]);
    } else {
      pwd.clearValidators(); pwd2.clearValidators(); pwd.setValue(''); pwd2.setValue('');
    }
    pwd.updateValueAndValidity(); pwd2.updateValueAndValidity(); this.form.updateValueAndValidity();
  }

  showCtrlError(name: string) { const c = this.form.get(name); return !!c && c.invalid && (c.dirty || c.touched); }
  getCtrl(name: string) { return this.form.get(name)!; }

  cancel(){ this.closed.emit(false); }

  async save() {
    if (this.isView) { this.closed.emit(false); return; }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      Swal.fire('Campos obligatorios','Revisa los campos resaltados y las notas bajo cada campo.','warning');
      return;
    }
    try {
      if (this.isCreate) {
        const fd = new FormData();
        Object.entries(this.form.value).forEach(([k, v]) => { if (v != null && k !== 'password2') fd.append(k, String(v)); });
        if (this.photoFile) fd.append('Foto', this.photoFile);
        await this.api.create(fd).toPromise();
        Swal.fire('Creado','Usuario creado correctamente','success');
        this.closed.emit(true);
      } else if (this.usuario) {
        const v = this.form.value;
        const payload: UsuarioUpdatePayload = {
          id: this.usuario.id,
          primerNombre: v.primerNombre,
          segundoNombre: v.segundoNombre,
          primerApellido: v.primerApellido,
          segundoApellido: v.segundoApellido,
          nit: v.nit, cui: v.cui,
          fechaNacimiento: v.fechaNacimiento, fechaIngreso: v.fechaIngreso,
          celular: v.celular, genero: v.genero, estado: v.estado,
          direccion: v.direccion, email: v.email, rolId: v.rolId
        };
        if (this.changePwd && v.password) payload.password = v.password;

        await this.api.update(this.usuario.id, payload).toPromise();
        if (this.photoFile) await this.api.uploadPhoto(this.usuario.id, this.photoFile).toPromise();

        Swal.fire('Actualizado','Usuario actualizado correctamente','success');
        this.closed.emit(true);
      }
    } catch (e: any) {
      const msg = typeof e?.error === 'string' ? e.error : e?.error?.message || e?.error?.title || e?.message || 'No se pudo guardar';
      Swal.fire('Error', String(msg), 'error'); this.closed.emit(false);
    }
  }

  async removeInside() {
    if (!this.usuario) return;
    const res = await Swal.fire({ icon: 'warning', title: '¿Eliminar usuario?', text: `${this.usuario.primerNombre} ${this.usuario.primerApellido}`, showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar' });
    if (!res.isConfirmed) return;
    try { await this.api.remove(this.usuario.id).toPromise(); Swal.fire('Eliminado','', 'success'); this.closed.emit(true); }
    catch (e: any) {
      const msg = typeof e?.error === 'string' ? e.error : e?.error?.message || e?.error?.title || e?.message || 'No se pudo eliminar';
      Swal.fire('Error', String(msg), 'error');
    }
  }
}
