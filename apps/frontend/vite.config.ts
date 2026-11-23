import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins:[react()], server:{proxy:{'/api':{target:'http://localhost:3000',ws:true},'/health':'http://localhost:3000'}}, test:{environment:'jsdom',setupFiles:['./tests/setup.ts'],exclude:['e2e/**','node_modules/**','dist/**']} });
