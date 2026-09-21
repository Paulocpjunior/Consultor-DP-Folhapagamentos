import type { Dossie } from './dossie';
// Apenas memória: navegação interna não perde o trabalho; logout limpa o cache.
let estado: { usuario: string; dossie: Dossie; alterado: boolean } | null = null;
export function lerSessao(usuario: string) { return estado?.usuario === usuario ? estado : null; }
export function guardarSessao(usuario: string, dossie: Dossie, alterado: boolean) { estado = { usuario, dossie, alterado }; }
export function limparSessaoImplantacao() { estado = null; }
