import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css'],
})
export class NavbarComponent {
  @Output() toggleSidebar = new EventEmitter<void>();

  private auth = inject(AuthService);
  private router = inject(Router);

  imgBroken = false;

  get name()    { return this.auth.getFirstName() || 'Usuario'; }
  get photo()   { return this.auth.getPhotoUrl(); }
  get initial() { return (this.name || 'U').charAt(0).toUpperCase(); }
  get displayPhoto() { return !!this.photo && !this.imgBroken; }

  photoFail() { this.imgBroken = true; }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
