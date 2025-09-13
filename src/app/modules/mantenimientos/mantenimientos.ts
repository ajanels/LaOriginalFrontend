import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';  
import { ReactiveFormsModule } from '@angular/forms';

type Card = {
  title: string;
  subtitle: string;
  route: string;
};

@Component({
  selector: 'app-mantenimientos',
  standalone: true,
  imports: [CommonModule, RouterLink,FormsModule,ReactiveFormsModule],
  templateUrl: './mantenimientos.html',
  styleUrls: ['./mantenimientos.css']
})
export class Mantenimientos {}
