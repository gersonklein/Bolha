// Variação de cada cópia de um objeto (Forja): a FONTE ÚNICA, usada pelo jogo (mundo.js, index.html) e pelas duas vistas
// da bancada da Forja (web/visor3d.js importa daqui). Não é copiada de web/: este arquivo é o original.
//   cor   = porte de ForjaAsset._marcar_cor + o recolor do baked.gdshader da Godot: a cor dominante do objeto (a lataria,
//           normalizada pelo maior canal, pesada pela área) vira a classe sorteada da paleta, com a luminância de cada
//           vértice × tom; no Degradê só a luminância conta, então a cópia sorteia um degrau (× a luminância)
//   valor = o objeto inteiro × 1 ± faixa (mais claro / mais escuro)
// O sorteio de cada cópia vem do lugar dela NO LAYOUT + a semente do layout + o bloco: a mesma cópia no mesmo sorteio sai
// igual na bancada e no jogo, e cada sorteio novo (outra semente) mostra outra combinação.
// As cores aqui são as do jogo (o tom cru: matiz da classe com luminância 1 × v), não as convertidas para a tela.
export const CORES_VARIAR = ['AC', 'CY', 'AZ', 'PE', 'CL', 'N', 'MG'], DEGRAUS_VARIAR = [.4, .6, 1.6, 2.2];

export function chaveCopia(eid, lx, lz, semente, ci = 0, cj = 0) { return `${eid}:${Math.round(lx * 4)}:${Math.round(lz * 4)}:${semente | 0}:${ci},${cj}`; }
function sorteio(txt, sem) {
  let h = 2166136261 ^ (sem | 0);
  for (const c of txt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
// o fator de valor da cópia (1 = como o modelo)
export function valorCopia(e, chave) {
  if (!e.variar_valor) return 1;
  const r = sorteio('valor:' + chave, e.variar_valor_semente);
  if (r() < (+e.variar_valor_original || 0)) return 1;
  return Math.max(.05, 1 + (r() * 2 - 1) * (e.variar_valor_faixa ?? .25));
}
// a cor da cópia: {para: matiz [r,g,b] de luminância 1, tom, tol} ou null (fica a original). hue(cls) → {r,g,b}
export function corCopia(e, chave, hue, degrade) {
  if (!e.variar_cor) return null;
  const r = sorteio('cor:' + chave, e.variar_semente);
  if (r() < (e.variar_original ?? .2)) return null;
  const cores = e.variar_cores?.length ? e.variar_cores : CORES_VARIAR, h = hue(cores[Math.floor(r() * cores.length) % cores.length]) || hue('CL');
  let tom = Math.round((1 + (r() * 2 - 1) * (e.variar_tom ?? .15)) / .05) * .05;
  if (degrade) { const dg = e.variar_degraus?.length ? e.variar_degraus : DEGRAUS_VARIAR; tom = dg[Math.floor(r() * dg.length) % dg.length]; }
  return { para: [h.r, h.g, h.b], tom, tol: e.variar_tolerancia ?? .18 };
}
// a cor dominante dos vértices [v0, v1) (triângulos soltos, ou com índice), normalizada pelo maior canal, pesada pela área
export function corDominante(pos, col, idx, v0, v1) {
  const soma = new Map(), n = idx ? idx.length : v1 - v0;
  for (let t = 0; t + 2 < n; t += 3) {
    const [a, b, c] = idx ? [idx[t], idx[t + 1], idx[t + 2]] : [v0 + t, v0 + t + 1, v0 + t + 2];
    const u = [0, 1, 2].map(k => pos[b * 3 + k] - pos[a * 3 + k]), w = [0, 1, 2].map(k => pos[c * 3 + k] - pos[a * 3 + k]);
    const ar = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
    const cr = col[a * 3], cg = col[a * 3 + 1], cb = col[a * 3 + 2], m = Math.max(cr, cg, cb);
    if (m < .02 || ar <= 0) continue;
    const q = [cr / m, cg / m, cb / m], k = q.map(x => Math.round(x * 20)).join(','), s = soma.get(k);
    if (s) { s.a += ar; for (let i = 0; i < 3; i++) s.c[i] += q[i] * ar; } else soma.set(k, { a: ar, c: q.map(x => x * ar) });
  }
  let best = null; for (const s of soma.values()) if (!best || s.a > best.a) best = s;
  return best ? best.c.map(x => x / best.a) : null;
}
// troca as cores [v0, v1) parecidas com a dominante "de" pela da cópia (= o recolor do baked.gdshader)
export function recolorir(col, v0, v1, de, m) {
  if (!de || !m) return;
  for (let i = v0; i < v1; i++) { const r = col[i * 3], g = col[i * 3 + 1], b = col[i * 3 + 2], cm = Math.max(r, g, b, 1e-4);
    if (Math.hypot(r / cm - de[0], g / cm - de[1], b / cm - de[2]) >= m.tol) continue;
    const L = (.299 * r + .587 * g + .114 * b) * m.tom; col[i * 3] = m.para[0] * L; col[i * 3 + 1] = m.para[1] * L; col[i * 3 + 2] = m.para[2] * L; }
}
// o elemento com a variação do NÍVEL por cima (Forja → bancada: "cores no sorteio" / "valor no sorteio"): ligada, vale para
// todos os objetos; o objeto marcado "não" fica de fora; o que o objeto escolheu (cores, tom, faixa…) continua valendo
export function comVariacaoDoNivel(e, nv) {
  if (!nv) return e;
  const out = { ...e };
  if (nv.cor && e.variar_cor !== false && e.variar_cor_nao !== true) out.variar_cor = true;
  if (nv.valor && e.variar_valor_nao !== true) { out.variar_valor = true; if (e.variar_valor_faixa == null && nv.faixa != null) out.variar_valor_faixa = nv.faixa; }
  return out;
}
