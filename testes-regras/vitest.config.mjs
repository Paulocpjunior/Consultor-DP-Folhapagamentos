// Testes das regras do Firestore e do Storage no emulador: npm run test:regras (precisa de Java).
export default { test: { environment: 'node', root: new URL('.', import.meta.url).pathname, include: ['*.test.mjs'], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 } };
