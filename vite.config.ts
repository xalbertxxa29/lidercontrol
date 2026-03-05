import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: '/lidercontrol/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                app: resolve(__dirname, 'app.html')
            }
        }
    },
    server: {
        port: 5173,
        open: true
    }
});
