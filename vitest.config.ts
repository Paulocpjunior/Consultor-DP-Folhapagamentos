import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Os testes das regras do Firestore rodam à parte, no emulador (npm run test:regras).
export default mergeConfig(viteConfig, defineConfig({ test: { exclude: [...configDefaults.exclude, 'testes-regras/**'] } }));
