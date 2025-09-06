import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { UsuariosService, Usuario } from '../../../services/usuarios.service';
import { RolesService, Rol } from '../../../services/roles.service';

export type ModalMode = 'create' | 'edit' | 'view';
type UsuarioWithRol = Usuario & { rolId?: number | null; rol?: { id: number; nombre: string } | null };

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
  photoPreview: string | null = null;
  roles: Rol[] = [];

  get isView()   { return this.mode === 'view'; }
  get isCreate() { return this.mode === 'create'; }
  get isEdit()   { return this.mode === 'edit';  }

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
      password: ['']
    });

    this.form.get('nit')?.valueChanges.subscribe(v => this.form.get('nit')?.setValue(this.onlyDigits(v, 9), { emitEvent: false }));
    this.form.get('cui')?.valueChanges.subscribe(v => this.form.get('cui')?.setValue(this.onlyDigits(v, 13), { emitEvent: false }));
    this.form.get('celular')?.valueChanges.subscribe(v => this.form.get('celular')?.setValue(this.onlyDigits(v, 8), { emitEvent: false }));

    this.rolesApi.list().subscribe({
      next: list => this.roles = list,
      error: () => Swal.fire('Error', 'No se pudieron cargar los roles', 'error')
    });

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

    if (this.isCreate) {
      this.form.get('password')?.setValidators([
        Validators.required,
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,64}$/)
      ]);
    }
    this.form.get('password')?.updateValueAndValidity();

    if (this.usuario?.fotoUrl) this.photoPreview = this.usuario.fotoUrl;
    if (this.isView) this.form.disable();
  }

  private onlyDigits(v: any, max: number) {
    return (String(v ?? '').replace(/\D+/g, '').slice(0, max));
  }

  private mapGeneroIn(g: string | undefined): string {
    if (!g) return 'Masculino';
    if (g === 'M') return 'Masculino';
    if (g === 'F') return 'Femenino';
    return g;
  }

  private validarFechas(): boolean {
    const fn = new Date(this.form.value.fechaNacimiento);
    const fi = new Date(this.form.value.fechaIngreso);
    const hoy = new Date();

    const minNac = new Date('1900-01-01');
    const minIng = new Date('1990-01-01');
    const maxNac = new Date(hoy); maxNac.setFullYear(hoy.getFullYear() - 15);

    if (!(fn >= minNac && fn <= maxNac)) {
      Swal.fire('Fecha de nacimiento inválida', 'Debe ser >= 1900-01-01 y <= hoy - 15 años.', 'warning');
      return false;
    }
    if (!(fi >= minIng && fi <= hoy)) {
      Swal.fire('Fecha de ingreso inválida', 'Debe ser >= 1990-01-01 y <= hoy.', 'warning');
      return false;
    }
    const minIngresoPorEdad = new Date(fn); minIngresoPorEdad.setFullYear(fn.getFullYear() + 15);
    if (fi < minIngresoPorEdad) {
      Swal.fire('Fecha de ingreso inválida', 'Debe ser al menos 15 años después de la fecha de nacimiento.', 'warning');
      return false;
    }
    return true;
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

  cancel() {
    this.closed.emit(false);
  }

  async save() {
    if (this.isView) {
      this.closed.emit(false);
      return;
    }

    this.form.markAllAsTouched(); // ⚠️ mostrar errores visuales

    if (this.form.invalid) {
      Swal.fire('Campos obligatorios', 'Revisa los campos resaltados en rojo', 'warning');
      return;
    }

    if (!this.validarFechas()) return;

    try {
      if (this.isCreate) {
        const fd = new FormData();
        Object.entries(this.form.value).forEach(([k, v]) => v != null && fd.append(k, String(v)));
        if (this.photoFile) fd.append('foto', this.photoFile);

        await this.api.create(fd).toPromise();
        Swal.fire('Creado', 'Usuario creado correctamente', 'success');
        this.closed.emit(true);

      } else if (this.usuario) {
        const payload = { ...this.form.value, id: this.usuario.id };
        await this.api.update(this.usuario.id, payload).toPromise();

        if (this.photoFile) {
          await this.api.uploadPhoto(this.usuario.id, this.photoFile).toPromise();
        }

        Swal.fire('Actualizado', 'Usuario actualizado correctamente', 'success');
        this.closed.emit(true);
      }
    } catch (e: any) {
      const msg = e?.error?.title || e?.error || 'No se pudo guardar';
      Swal.fire('Error', String(msg), 'error');
      this.closed.emit(false);
    }
  }
}
