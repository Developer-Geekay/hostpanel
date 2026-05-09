import { Injectable, signal, effect } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    isDark = signal<boolean>(localStorage.getItem('theme') === 'dark');

    constructor() {
        effect(() => {
            if (this.isDark()) {
                document.body.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    toggleTheme() {
        this.isDark.update(d => !d);
    }
}
