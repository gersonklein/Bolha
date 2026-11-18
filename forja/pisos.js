// Ladrilhos da Forja: pisos, paredes e portas do nível. O jogo é visto de cima (~58°): o que mais aparece é o PISO
// e o TOPO das paredes, então cada nível tem uma biblioteca de 15–30 pisos e de paredes, todos procedurais.
//
//   piso   = {id, nome, padrao, tam, gap, cls, v, cls2, v2, junta, variacao, ruido, gasto, rot, papel, peso, ativo, desenho?}
//   parede = {id, nome, padrao, cls, v, cls2, v2, topo_cls, topo_v, bloco, junta, variacao, ruido, meia, rodape, aba, pilar, papel, peso, ativo}
//   porta  = {cls, v, sinal}
//
// A geometria (quadsPiso, pecasParede, mancha) é a MESMA que o ForjaPiso.gd monta na Godot (porte linha a linha):
// mudou aqui, mude lá (forja/godot.py → PISO_GD).

import { biblioteca, escolherParede, chaoCoerente, tipoBarreira, contexto } from './criterios.js';
import { camadasChao } from './chao_camadas.js';
// ------------------------------------------------------------------------------------------------ hash e ruído (iguais ao GD)
export function h(i, j, k) {
  let x = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}
export function vnoise(x, z, k) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h(i, j, k), b = h(i + 1, j, k), c = h(i, j + 1, k), d = h(i + 1, j + 1, k);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, o, k) { let s = 0, a = .5, f = 1, n = 0; for (let q = 0; q < o; q++) { s += a * vnoise(x * f, z * f, k + q); n += a; a *= .5; f *= 2; } return s / n; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cl = (x, a, b) => Math.max(a, Math.min(b, x));

// multiplicador de tom num ponto do chão: manchas grandes (sujeira, umidade) + granulado fino
export function mancha(s, x, z, seed) {
  const r = s.ruido || 0; if (r <= 0) return 1;
  const big = sstep(.5, .78, fbm(x * .16 + seed * .37, z * .16 - seed * .21, 3, 11));
  const fino = vnoise(x * 2.1, z * 2.1, 17 + seed) - .5;
  return Math.max(.35, 1 - r * .42 * big - r * .14 * fino);
}

// ------------------------------------------------------------------------------------------------ padrões
// cada padrão: rótulo, dica e os valores de partida dos controles
export const PADROES_PISO = {
  ladrilho: { nome: 'Ladrilho', dica: 'grade de peças quadradas com rejunte', tam: .6, gap: .02, variacao: .3, ruido: .35, gasto: .1 },
  xadrez: { nome: 'Xadrez', dica: 'peças alternando as duas cores', tam: .5, gap: .015, variacao: .2, ruido: .3, gasto: .1 },
  carpete: { nome: 'Carpete em placas', dica: 'placas sem rejunte, com o tom virando a cada placa', tam: .5, gap: .004, variacao: .25, ruido: .5, gasto: 0 },
  placas: { nome: 'Placas de concreto', dica: 'placas grandes, juntas finas, trincas', tam: 2, gap: .02, variacao: .45, ruido: .6, gasto: .2 },
  liso: { nome: 'Liso', dica: 'superfície contínua (cimento, resina) com juntas de dilatação', tam: 3, gap: .008, variacao: .1, ruido: .55, gasto: 0 },
  tabuas: { nome: 'Tábuas', dica: 'réguas de madeira de comprimentos defasados', tam: .2, gap: .008, variacao: .5, ruido: .3, gasto: .05, comp: 1.6 },
  tijolos: { nome: 'Tijolos', dica: 'peças retangulares em amarração', tam: .25, gap: .02, variacao: .45, ruido: .35, gasto: .1 },
  pedras: { nome: 'Pedras', dica: 'fiadas de pedras de larguras irregulares', tam: .5, gap: .04, variacao: .55, ruido: .4, gasto: .1 },
  grade: { nome: 'Grade metálica', dica: 'barras sobre um vão escuro', tam: .3, gap: .2, variacao: .1, ruido: .3, gasto: 0 },
  manchas: { nome: 'Manchas', dica: 'terra, grama, água: duas cores em manchas orgânicas', tam: 1.5, gap: 0, variacao: .2, ruido: .4, gasto: 0 },
  organico: { nome: 'Orgânico (terra, areia, grama)', dica: 'chão contínuo, sem peças nem grade: a cor 2 entra em manchas suaves de ruído, com grão fino', tam: 3, gap: 0, variacao: .25, ruido: .5, gasto: 0, limiar: .55 },
  desenho: { nome: 'Desenho', dica: 'uma peça desenhada à mão, repetida', tam: .8, gap: 0, variacao: .15, ruido: .3, gasto: 0 },
};
export const PADROES_PAREDE = {
  liso: { nome: 'Reboco liso', bloco: 0, junta: 0, variacao: .08, ruido: .25, meia: 0, rodape: true, aba: .03, pilar: 0 },
  tijolo: { nome: 'Tijolo', bloco: .25, junta: .012, variacao: .35, ruido: .3, meia: 0, rodape: false, aba: 0, pilar: 0 },
  blocos: { nome: 'Blocos de concreto', bloco: .4, junta: .012, variacao: .2, ruido: .35, meia: 0, rodape: false, aba: .02, pilar: 0 },
  concreto: { nome: 'Concreto', bloco: 1.2, junta: .01, variacao: .25, ruido: .55, meia: 0, rodape: false, aba: 0, pilar: 3.6 },
  paineis: { nome: 'Painéis', bloco: 1.2, junta: .02, variacao: .12, ruido: .15, meia: 0, rodape: true, aba: .03, pilar: 0 },
  azulejo: { nome: 'Azulejo até a meia altura', bloco: .15, junta: .01, variacao: .15, ruido: .2, meia: .45, rodape: false, aba: .02, pilar: 0 },
  madeira: { nome: 'Madeira', bloco: .14, junta: .008, variacao: .4, ruido: .2, meia: 0, rodape: true, aba: .02, pilar: 0 },
  metal: { nome: 'Metal ondulado', bloco: .1, junta: .02, variacao: .06, ruido: .4, meia: 0, rodape: false, aba: 0, pilar: 2.4 },
  pedra: { nome: 'Pedra', bloco: .45, junta: .025, variacao: .5, ruido: .35, meia: 0, rodape: false, aba: .04, pilar: 0 },
  sebe: { nome: 'Sebe', bloco: .6, junta: 0, variacao: .3, ruido: .5, meia: 0, rodape: false, aba: .06, pilar: 0 },
};
export const PAPEIS = { principal: 'principal (o chão de sempre)', sala: 'sala / cômodo', corredor: 'corredor / passagem', detalhe: 'detalhe (tapete, poça, remendo)', externo: 'área externa', via: 'via (estrada, asfalto)' };

// ------------------------------------------------------------------------------------------------ alturas (sem z-fighting)
// A câmera fica a ~20 m: superfícies a menos de ~5 mm uma da outra piscam. Então tudo que é plano tem um degrau fixo:
//   região do chão na camada c (0 = as que não se sobrepõem; 1–3 = detalhes por cima): rejunte em 2 mm + c·8 mm,
//   peças +3 mm, a cor B da grade +5 mm. O chão mais alto fica abaixo de 3,1 cm; as coisas chatas no chão começam em
//   5 cm; as marcas da receita ficam a 3,8 cm, com folga para não piscar contra o piso nem as coberturas.
export const ALT = { base: (c) => .002 + c * .008, peca: .003, cruz: .002, chato: .05, faixa: .009 };
// camada de cada região: 1 + a maior camada das anteriores que ela cobre (no máximo 3)
export function camadas(chao) {
  const out = [];
  chao.forEach((g, k) => { let c = 0;
    for (let i = 0; i < k; i++) { const o = chao[i]; if (Math.min(g.x1, o.x1) - Math.max(g.x0, o.x0) > .01 && Math.min(g.z1, o.z1) - Math.max(g.z0, o.z0) > .01) c = Math.max(c, out[i] + 1); }
    out.push(Math.min(3, c)); });
  return out;
}

// ------------------------------------------------------------------------------------------------ geometria do piso
// quads [x0, z0, x1, z1, ci, v]: ci 0 = cor A, 1 = cor B, 2 = rejunte, 3 = escuro. O primeiro é o fundo (rejunte).
export const MAX_QUADS = 14000;
export function clsDe(s, ci) { return ci === 1 ? (s.cls2 || s.cls) : ci === 3 ? 'AZ' : s.cls; }
// detalhe orgânico (lama, água, grama úmida): o retângulo vira mancha — elipse com a borda comida por ruído. true = dentro
export function dentroMancha(g, x, z, seed = 1) {
  const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, rx = (g.x1 - g.x0) / 2, rz = (g.z1 - g.z0) / 2, dx = (x - cx) / rx, dz = (z - cz) / rz;
  return Math.hypot(dx, dz) + (fbm(x * .9 + seed * .7, z * .9 - seed * .3, 3, 47) - .5) * .7 < .82;
}
// chão orgânico: em cada ponto, a cor (classe) e o tom — a cor 2 entra em manchas grandes e suaves (fbm), com borda
// macia e um grão fino por cima. Devolve [classe, tom]: perto da borda das manchas o tom mistura os dois
export function tomOrganico(s, x, z, seed = 1) {
  const T = Math.max(.5, +s.tam || 3), f = 1 / T, lim = s.limiar ?? .55, n = fbm(x * f + seed * .37, z * f - seed * .21, 4, 31);
  const t = sstep(lim - .08, lim + .08, n), grao = (vnoise(x * 3.1, z * 3.1, 19 + seed) - .5) * (s.ruido ?? .5) * .3, veio = (fbm(x * f * 4, z * f * 4, 2, 37) - .5) * (s.variacao ?? .25) * .5;
  const A = s.v, B = s.v2 ?? s.v * .85, v = (A + (B - A) * t) * (1 + grao + veio);
  return [t < .5 ? s.cls : (s.cls2 || s.cls), Math.max(.03, v)];
}
export function quadsPiso(s, x0, z0, x1, z1, seed = 1) {
  const out = [[x0, z0, x1, z1, 2, s.junta ?? s.v * .55]];
  const rot = (s.rot || 0) % 180 === 90, T = Math.max(.12, +s.tam || .6), g = Math.max(0, +s.gap || 0), va = s.variacao || 0, gs = s.gasto || 0;
  const [u0, w0, u1, w1] = rot ? [z0, x0, z1, x1] : [x0, z0, x1, z1];
  const tom = (base, i, j) => base * (1 + (h(i, j, seed * 13 + 1) - .5) * va * .6);
  const put = (a0, b0, a1, b1, ci, v, i = 0, j = 0) => {
    a0 = Math.max(a0, u0); b0 = Math.max(b0, w0); a1 = Math.min(a1, u1); b1 = Math.min(b1, w1);
    if (a1 - a0 < .004 || b1 - b0 < .004 || out.length >= MAX_QUADS) return;
    if (gs > 0) { const q = h(i, j, seed * 13 + 7); if (q < gs * .22) return; if (q < gs * .6) v *= .78; }
    out.push(rot ? [b0, a0, b1, a1, ci, v] : [a0, b0, a1, b1, ci, v]);
  };
  const A = s.v, B = s.v2 ?? s.v, hg = g / 2, iu0 = Math.floor(u0 / T), iu1 = Math.ceil(u1 / T), iw0 = Math.floor(w0 / T), iw1 = Math.ceil(w1 / T);
  switch (s.padrao) {
    case 'xadrez': case 'ladrilho': case 'carpete': case 'placas': case 'liso':
      for (let i = iu0; i < iu1; i++) for (let j = iw0; j < iw1; j++) {
        const ci = s.padrao === 'xadrez' ? ((i + j) & 1) : 0;
        let v = tom(ci ? B : A, i, j); if (s.padrao === 'carpete' && ((i + j) & 1)) v *= .9;
        if (s.padrao === 'placas' && h(i, j, seed * 13 + 3) < .3) { // trinca: a placa vira duas
          const c = (i + .3 + h(i, j, 4) * .4) * T, vert = h(i, j, 5) < .5;
          if (vert) { put(i * T + hg, j * T + hg, c - hg, (j + 1) * T - hg, 0, v, i, j); put(c + hg, j * T + hg, (i + 1) * T - hg, (j + 1) * T - hg, 0, v * .95, i, j); }
          else { const cw = (j + .3 + h(i, j, 6) * .4) * T; put(i * T + hg, j * T + hg, (i + 1) * T - hg, cw - hg, 0, v, i, j); put(i * T + hg, cw + hg, (i + 1) * T - hg, (j + 1) * T - hg, 0, v * .95, i, j); }
          continue;
        }
        put(i * T + hg, j * T + hg, (i + 1) * T - hg, (j + 1) * T - hg, ci, v, i, j);
      } break;
    case 'tabuas': { const P = Math.max(T * 2, +s.comp || T * 8);
      for (let j = iw0; j < iw1; j++) { const off = h(0, j, seed * 13 + 2) * P, a = Math.floor((u0 - off) / P) - 1, b = Math.ceil((u1 - off) / P) + 1;
        for (let i = a; i < b; i++) put(off + i * P + hg, j * T + hg, off + (i + 1) * P - hg, (j + 1) * T - hg, h(i, j, 9) < .12 ? 1 : 0, tom(A, i, j), i, j); } break; }
    case 'tijolos': { const P = T * 2;
      for (let j = iw0; j < iw1; j++) { const off = (j & 1) * T, a = Math.floor((u0 - off) / P) - 1, b = Math.ceil((u1 - off) / P) + 1;
        for (let i = a; i < b; i++) { const ci = h(i, j, 10) < .15 ? 1 : 0; put(off + i * P + hg, j * T + hg, off + (i + 1) * P - hg, (j + 1) * T - hg, ci, tom(ci ? B : A, i, j), i, j); } } break; }
    case 'pedras': { const P = T * 1.5, x = (k, j) => k * P + (h(k, j, seed * 13 + 8) - .5) * P * .7;
      for (let j = iw0; j < iw1; j++) { const a = Math.floor(u0 / P) - 1, b = Math.ceil(u1 / P) + 1;
        for (let k = a; k < b; k++) { const ci = h(k, j, 11) < .2 ? 1 : 0; put(x(k, j) + hg, j * T + hg, x(k + 1, j) - hg, (j + 1) * T - hg, ci, tom(ci ? B : A, k, j), k, j); } } break; }
    case 'grade': { const bw = Math.max(.02, T - g);
      for (let i = iu0; i < iu1; i++) put(i * T, w0, i * T + bw, w1, 0, tom(A, i, 0), i, 0);
      const P = T * 4; for (let j = Math.floor(w0 / P); j < Math.ceil(w1 / P); j++) put(u0, j * P, u1, j * P + bw * 1.6, 1, tom(B, 0, j), 0, j); break; }
    case 'manchas': { const c = Math.max(.2, T / 6), f = 1 / Math.max(.3, T), lim = .5 + ((s.limiar ?? .5) - .5) * .5;
      for (let j = Math.floor(w0 / c); j < Math.ceil(w1 / c); j++) { let ini = null, ci0 = -1;
        const fecha = (i) => { if (ini !== null) put(ini * c, j * c, i * c, (j + 1) * c, ci0, tom(ci0 ? B : A, ini, j), ini, j); };
        for (let i = Math.floor(u0 / c); i <= Math.ceil(u1 / c); i++) {
          const ci = i < Math.ceil(u1 / c) ? (fbm((i + .5) * c * f + seed, (j + .5) * c * f, 3, 21) > lim ? 1 : 0) : -2;
          if (ci !== ci0) { fecha(i); ini = i; ci0 = ci; } } } break; }
    case 'desenho': { const d = s.desenho || DESENHO_PADRAO(), n = d.n, c = T / n, vs = [A, B, s.junta ?? A * .55, .1];
      for (let i = iu0; i < iu1; i++) for (let j = iw0; j < iw1; j++) { const tj = 1 + (h(i, j, seed * 13 + 1) - .5) * va * .6;
        for (let y = 0; y < n; y++) { let ini = 0;
          for (let x = 1; x <= n; x++) { const a = d.px[y * n + ini]; if (x < n && d.px[y * n + x] === a) continue;
            put(i * T + ini * c, j * T + y * c, i * T + x * c, j * T + (y + 1) * c, a, vs[a] * (a < 2 ? tj : 1), i, j); ini = x; } } } break; }
    case 'organico': out.length = 0; out.push([x0, z0, x1, z1, 0, A]); break; // contínuo: a cor sai de tomOrganico, ponto a ponto
    default: put(u0, w0, u1, w1, 0, A);
  }
  return out;
}
export const DESENHO_PADRAO = (n = 8) => ({ n, px: Array.from({ length: n * n }, (_, k) => { const x = k % n, y = Math.floor(k / n); return x === 0 || y === 0 ? 2 : (x + y) % (n / 2) === 0 ? 1 : 0; }) });
export const quantosQuads = (s, area) => { const T = Math.max(.12, +s.tam || .6); return s.padrao === 'desenho' ? area / (T * T) * (s.desenho?.n || 8) * 2 : s.padrao === 'manchas' ? area / (Math.max(.2, T / 6) ** 2) * .3 : area / (T * T) * (s.padrao === 'tabuas' ? T * 8 / Math.max(T * 2, +s.comp || T * 8) : 1); };

// ------------------------------------------------------------------------------------------------ geometria da parede
// caixas [a0, y0, b0, a1, y1, b1, cls, v] no espaço da parede: a ao longo (−comp/2…comp/2), y para cima, b na espessura.
// ua = posição da parede no mundo ao longo do seu eixo (para o ruído e as juntas continuarem de uma parede para outra)
export function pecasParede(s, comp, alt, esp, seed = 1, ua = 0) {
  if (s.padrao === 'sebe') {
    const v = s.v ?? .3, cls = s.cls || 'VG', topo = Math.max(.2, alt - .18);
    return [[-comp / 2, 0, -esp / 2, comp / 2, topo, esp / 2, cls, v], [-comp / 2 + Math.min(.1, comp / 4), topo, -esp / 2 + Math.min(.1, esp / 4), comp / 2 - Math.min(.1, comp / 4), alt, esp / 2 - Math.min(.1, esp / 4), cls, v * 1.08]];
  }
  const out = [], hc = comp / 2, he = esp / 2, va = s.variacao || 0, B = +s.bloco || 0, J = +s.junta || 0, top = s.topo_cls || 'AZ', tv = s.topo_v ?? .25;
  const tomA = (k) => s.v * (1 + (h(k, 0, seed * 7 + 1) - .5) * va) * (1 - (s.ruido || 0) * .3 * (vnoise(k * .37 + seed, 3.1, 31) - .5) * 2);
  const meiaH = cl(+s.meia || 0, 0, .95) * alt, rod = s.rodape && alt > .8 ? .1 : 0, y0 = Math.max(meiaH, rod);
  if (B > 0 && J > 0) out.push([-hc, 0, -he + J, hc, alt - .001, he - J, s.cls, s.v * .5]); // o miolo escuro que aparece nas juntas
  const corpo = (a0, a1, yA, yB, cls, v) => out.push([a0, yA, -he, a1, yB, he, cls, v]);
  if (B > 0) { const k0 = Math.floor((ua - hc) / B), k1 = Math.ceil((ua + hc) / B);
    for (let k = k0; k < k1; k++) { const a0 = Math.max(-hc, k * B - ua + J / 2), a1 = Math.min(hc, (k + 1) * B - ua - J / 2); if (a1 - a0 > .01) corpo(a0, a1, y0, alt, s.cls, tomA(k)); } }
  else { const k0 = Math.floor((ua - hc) / 1.5), k1 = Math.ceil((ua + hc) / 1.5); for (let k = k0; k < k1; k++) { const a0 = Math.max(-hc, k * 1.5 - ua), a1 = Math.min(hc, (k + 1) * 1.5 - ua); if (a1 - a0 > .01) corpo(a0, a1, y0, alt, s.cls, tomA(k)); } }
  if (meiaH > 0) { const bb = Math.max(.1, B || .3), k0 = Math.floor((ua - hc) / bb), k1 = Math.ceil((ua + hc) / bb);
    for (let k = k0; k < k1; k++) { const a0 = Math.max(-hc, k * bb - ua + .004), a1 = Math.min(hc, (k + 1) * bb - ua - .004); if (a1 - a0 > .01) out.push([a0, rod, -he - .015, a1, meiaH, he + .015, s.cls2 || s.cls, (s.v2 ?? s.v) * (1 + (h(k, 1, seed) - .5) * va * .5)]); } }
  if (rod) out.push([-hc, 0, -he - .02, hc, rod, he + .02, s.cls2 || 'AZ', (s.v2 ?? .3) * .6]);
  const aba = +s.aba || 0; // topo (capa): o que a câmera mais vê
  { const P = Math.max(.5, (B || .6) * 2), k0 = Math.floor((ua - hc) / P), k1 = Math.ceil((ua + hc) / P);
    for (let k = k0; k < k1; k++) { const a0 = Math.max(-hc - aba, k * P - ua + .006), a1 = Math.min(hc + aba, (k + 1) * P - ua - .006); if (a1 - a0 > .01) out.push([a0, alt, -he - aba, a1, alt + .05, he + aba, top, tv * (1 + (h(k, 2, seed) - .5) * va * .5)]); } }
  if (+s.pilar > 0) { const P = +s.pilar, k0 = Math.ceil((ua - hc + .2) / P), k1 = Math.floor((ua + hc - .2) / P);
    for (let k = k0; k <= k1; k++) { const a = k * P - ua; out.push([a - .16, 0, -he - .07, a + .16, alt + .07, he + .07, s.cls2 || s.cls, (s.v2 ?? s.v) * .9]); } }
  return out;
}

// ------------------------------------------------------------------------------------------------ biblioteca: bases → 15–30 variações
let _n = 0; const nid = (p) => `${p}${Date.now().toString(36)}${(_n++).toString(36)}`;
export function pisoNovo(o = {}) { const pd = PADROES_PISO[o.padrao] || PADROES_PISO.ladrilho;
  return { id: nid('pi'), nome: 'Piso novo', padrao: 'ladrilho', tam: pd.tam, gap: pd.gap, cls: 'CL', v: .62, cls2: 'CL', v2: .5, junta: .34, variacao: pd.variacao, ruido: pd.ruido, gasto: pd.gasto, rot: 0, papel: 'sala', peso: 1, ativo: true, origem: 'mao', ...o }; }
export function paredeNova(o = {}) { const pd = PADROES_PAREDE[o.padrao] || PADROES_PAREDE.liso;
  return { id: nid('pa'), nome: 'Parede nova', padrao: 'liso', cls: 'N', v: .78, cls2: 'CL', v2: .5, topo_cls: 'AZ', topo_v: .22, ...pd, nome_padrao: undefined, papel: 'sala', peso: 1, ativo: true, origem: 'mao', ...o }; }

export const MODS_PISO = [
  ['gasto', 'gasto', (s) => ({ gasto: cl((s.gasto || 0) + .35, 0, 1), ruido: cl((s.ruido || 0) + .25, 0, 1), v: s.v * .9 })],
  ['escuro', 'mais escuro', (s) => ({ v: s.v * .72, v2: (s.v2 ?? s.v) * .75, junta: (s.junta ?? s.v * .55) * .8 })],
  ['grande', 'peças maiores', (s) => ({ tam: +(s.tam * 1.8).toFixed(2) })],
  ['claro', 'mais claro', (s) => ({ v: Math.min(1.15, s.v * 1.2), v2: Math.min(1.15, (s.v2 ?? s.v) * 1.18), papel: s.papel === 'principal' ? 'sala' : s.papel })],
  ['girado', 'girado', (s) => ({ rot: ((s.rot || 0) + 90) % 180 })],
  ['inverso', 'cores trocadas', (s) => ({ cls: s.cls2 || s.cls, v: s.v2 ?? s.v, cls2: s.cls, v2: s.v })],
  ['umido', 'úmido', (s) => ({ ruido: 1, v: s.v * .82, papel: 'detalhe', peso: .6 })],
  ['pequeno', 'peças menores', (s) => ({ tam: +Math.max(.15, s.tam * .55).toFixed(2) })],
  ['limpo', 'limpo', (s) => ({ ruido: (s.ruido || 0) * .3, gasto: 0, variacao: (s.variacao || 0) * .5 })],
];
export const MODS_PAREDE = [
  ['suja', 'suja', (s) => ({ ruido: cl((s.ruido || 0) + .35, 0, 1), v: s.v * .88 })],
  ['meia', 'com barrado', (s) => ({ meia: s.meia ? 0 : .4, cls2: s.cls2 || 'CL' })],
  ['escura', 'escura', (s) => ({ v: s.v * .7, topo_v: (s.topo_v ?? .25) * .8 })],
  ['pilares', 'com pilares', (s) => ({ pilar: s.pilar ? 0 : 3 })],
  ['clara', 'clara', (s) => ({ v: Math.min(1.1, s.v * 1.18) })],
  ['capa', 'capa larga', (s) => ({ aba: (s.aba || 0) + .05, topo_v: Math.min(1, (s.topo_v ?? .25) * 1.6) })],
];
export function expandir(bases, alvo, mods, novo) {
  const out = bases.map(b => novo({ ...b, id: nid(b.padrao ? 'b' : 'b'), origem: 'auto', base: b.nome }));
  for (let r = 0; out.length < alvo && r < mods.length * 3; r++)
    for (let i = 0; i < bases.length && out.length < alvo; i++) { const [k, rot, f] = mods[(r + i) % mods.length], b = bases[i];
      out.push(novo({ ...b, ...f(b), id: nid(k), nome: `${b.nome} — ${rot}`, origem: 'auto', base: b.nome, peso: (f(b).peso ?? b.peso ?? 1) * .7 })); }
  return out;
}

// pisos e paredes de partida quando a leitura das imagens ainda não trouxe nenhum
export function basesPadrao(lay = {}) {
  const c = lay.piso_cls || 'CL', v = lay.piso_v || .6, ext = !!lay.aberto;
  return {
    pisos: ext ? [
      { nome: 'Chão do lugar', padrao: 'placas', cls: c, v, cls2: c, v2: v * .85, papel: 'principal' },
      { nome: 'Terra', padrao: 'manchas', cls: 'PD', v: .5, cls2: 'FE', v2: .42, papel: 'externo' },
      { nome: 'Grama', padrao: 'manchas', cls: 'VD', v: .45, cls2: 'VG', v2: .55, papel: 'externo' },
      { nome: 'Calçamento', padrao: 'pedras', cls: 'CL', v: .62, cls2: 'PD', v2: .5, papel: 'corredor' },
      { nome: 'Poça', padrao: 'manchas', cls: 'CY', v: .45, cls2: c, v2: v * .8, papel: 'detalhe', tam: 2.5 },
    ] : [
      { nome: 'Chão do lugar', padrao: 'ladrilho', cls: c, v, cls2: c, v2: v * .85, papel: 'principal' },
      { nome: 'Carpete', padrao: 'carpete', cls: 'N', v: .62, cls2: 'MG', v2: .5, papel: 'sala' },
      { nome: 'Cimento', padrao: 'placas', cls: 'CL', v: .6, cls2: 'CL', v2: .52, papel: 'corredor' },
      { nome: 'Assoalho', padrao: 'tabuas', cls: 'PD', v: .58, cls2: 'PD', v2: .45, papel: 'sala' },
      { nome: 'Xadrez', padrao: 'xadrez', cls: 'CL', v: .85, cls2: 'AZ', v2: .3, papel: 'sala' },
      { nome: 'Tapete', padrao: 'carpete', cls: 'MG', v: .45, cls2: 'AC', v2: .55, papel: 'detalhe', tam: .35 },
    ],
    paredes: ext ? [
      { nome: 'Muro', padrao: 'blocos', cls: 'CL', v: .65, papel: 'principal' },
      { nome: 'Sebe', padrao: 'sebe', cls: 'VG', v: .35, topo_cls: 'VG', topo_v: .42, papel: 'externo' },
      { nome: 'Tijolo', padrao: 'tijolo', cls: 'PD', v: .55, papel: 'sala' },
    ] : [
      { nome: 'Parede do lugar', padrao: 'liso', cls: 'N', v: .78, papel: 'principal' },
      { nome: 'Divisória', padrao: 'paineis', cls: 'CL', v: .7, cls2: 'AZ', v2: .3, papel: 'sala' },
      { nome: 'Azulejo', padrao: 'azulejo', cls: 'N', v: .75, cls2: 'CY', v2: .7, papel: 'sala' },
      { nome: 'Concreto', padrao: 'concreto', cls: 'CL', v: .6, papel: 'corredor' },
    ],
    coberturas: ext ? [
      { tipo: 'capim', cls: 'VG', v: .4, densidade: .7, arranjo: 'aglomerado' }, { tipo: 'mato', cls: 'FE', v: .45, densidade: .4 },
      { tipo: 'pedras', densidade: .4, arranjo: 'espalhado' }, { tipo: 'folhas', densidade: .5 }, { tipo: 'pocas', densidade: .3 },
      { tipo: 'flores', densidade: .5, arranjo: 'fileiras' }, { tipo: 'arbustos', densidade: .3 }, { tipo: 'entulho', densidade: .3 },
    ] : [
      { tipo: 'sujeira', densidade: .35, arranjo: 'objetos' }, { tipo: 'papeis', densidade: .4 }, { tipo: 'rachaduras', densidade: .15 },
      { tipo: 'entulho', densidade: .3, arranjo: 'beiradas' }, { tipo: 'pocas', densidade: .2 },
      { tipo: 'caixas', densidade: .25, arranjo: 'beiradas' }, { tipo: 'musgo', densidade: .2 }, { tipo: 'ralos', densidade: .2 },
    ],
    porta: { cls: 'AC', v: .95, sinal: true },
  };
}
// chão, parede e coisas de FORA (orgânicos: manchas de ruído, sem grade) — entram quando o nível tem parte externa e a
// biblioteca ainda não tem nada com papel "externo" (senão o jardim pegaria o ladrilho de dentro)
export function basesExternas() {
  return {
    pisos: [{ nome: 'Grama', padrao: 'organico', cls: 'VD', v: .42, cls2: 'PD', v2: .45, papel: 'externo', tam: 3.5, limiar: .62, ruido: .55 },
            { nome: 'Terra', padrao: 'organico', cls: 'PD', v: .48, cls2: 'VD', v2: .4, papel: 'externo', tam: 2.5, limiar: .6, ruido: .5 },
            { nome: 'Areia', padrao: 'organico', cls: 'PE', v: .8, cls2: 'CL', v2: .68, papel: 'externo', tam: 4, limiar: .55, ruido: .35 },
            { nome: 'Cascalho', padrao: 'organico', cls: 'CL', v: .58, cls2: 'PD', v2: .48, papel: 'externo', tam: 1.2, limiar: .5, ruido: .8 },
            { nome: 'Calçamento', padrao: 'pedras', cls: 'CL', v: .62, cls2: 'PD', v2: .5, papel: 'externo', peso: .5 },
            { nome: 'Asfalto', padrao: 'liso', cls: 'AZ', v: .3, cls2: 'AZ', v2: .25, papel: 'via', tam: 6, ruido: .5 },
            { nome: 'Lama', padrao: 'organico', cls: 'PD', v: .3, cls2: 'AZ', v2: .22, papel: 'detalhe', amb: 'externo', tam: 1.5, limiar: .5 },
            { nome: 'Água rasa', padrao: 'organico', cls: 'CY', v: .45, cls2: 'AZ', v2: .32, papel: 'detalhe', amb: 'externo', tam: 2, limiar: .5, ruido: .25 }],
    paredes: [{ nome: 'Sebe', padrao: 'sebe', cls: 'VG', v: .35, topo_cls: 'VG', topo_v: .42, papel: 'externo' },
              { nome: 'Muro', padrao: 'blocos', cls: 'CL', v: .65, papel: 'externo' }],
    coberturas: [{ tipo: 'capim', cls: 'VG', v: .4, densidade: .8, arranjo: 'aglomerado' }, { tipo: 'mato', densidade: .5, arranjo: 'aglomerado' },
                 { tipo: 'flores', densidade: .35, arranjo: 'fileiras' }, { tipo: 'arbustos', densidade: .35 }, { tipo: 'folhas', densidade: .4 },
                 { tipo: 'pedras', densidade: .35, arranjo: 'espalhado' }, { tipo: 'raizes', densidade: .2 }],
  };
}
// chão de fora: papel externo, marcado como de fora, ou de cor vegetal (grama, musgo) — nunca entra em ambiente interno
export const ehDeFora = (x) => x.papel === 'externo' || x.amb === 'externo' || ['VG', 'VD'].includes(x.cls) || ['VG', 'VD'].includes(x.cls2);
export const temExterno = (v, papel = 'externo') => (v?.pisos || []).some(x => x.papel === papel && x.ativo !== false);
// a biblioteca automática: bases (da IA ou padrão) → pisos e paredes; o que o autor fez/ajustou à mão fica
export function bibliotecaAuto(bases, antiga = null, alvoP = 24, alvoW = 16) {
  const mao = (l) => (l || []).filter(x => x.origem === 'mao');
  const bp = bases.pisos.map(b => ({ ...(PADROES_PISO[b.padrao] || {}), ...b })), bw = bases.paredes.map(b => ({ ...(PADROES_PAREDE[b.padrao] || {}), ...b }));
  const v = {
    pisos: [...mao(antiga?.pisos), ...expandir(bp, Math.max(bp.length, alvoP - mao(antiga?.pisos).length), MODS_PISO, pisoNovo)],
    paredes: [...mao(antiga?.paredes), ...expandir(bw, Math.max(bw.length, alvoW - mao(antiga?.paredes).length), MODS_PAREDE, paredeNova)],
    coberturas: [...mao(antiga?.coberturas), ...(bases.coberturas || []).map(b => coberturaNova({ ...b, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== '')), origem: 'auto', nome: b.nome || TIPOS_COBERTURA[b.tipo]?.nome || b.tipo }))],
    porta: antiga?.porta?.origem === 'mao' ? antiga.porta : { ...(bases.porta || { cls: 'AC', v: .95 }), sinal: true },
    de: bases.quando || 0, alvo: [alvoP, alvoW],
  };
  return comPerfis(v, antiga);
}

// ------------------------------------------------------------------------------------------------ perfis
// Um layout não sorteia mais de toda a biblioteca: ele sorteia UM perfil de piso (um piso para os espaços amplos, outro
// para os fechados) e UM perfil de coisas no chão (quais coisas em cada tipo de espaço). O dado (0–1) é a chance de cada
// espaço fugir do perfil — 0 = tudo pelo perfil, 1 = como antes (tudo sorteado).
//   perfil de piso   = {id, nome, amplo: idPiso, fechado: idPiso, peso, ativo, origem}
//   perfil de coisas = {id, nome, amplo: [idCobertura], fechado: [idCobertura], peso, ativo, origem}
//   vis.perfil       = {usar, dado, limite (m²: acima disso o espaço é amplo)}
export const ESPACOS = { amplo: 'espaço amplo', fechado: 'espaço fechado' };
export const PERFIL_PADRAO = { usar: true, dado: .1, limite: 60 };
export function perfilPisoNovo(o = {}) { return { id: nid('pp'), nome: 'Perfil novo', amplo: null, fechado: null, peso: 1, ativo: true, origem: 'mao', ...o }; }
export function perfilCoisasNovo(o = {}) { return { id: nid('pc'), nome: 'Perfil novo', amplo: [], fechado: [], peso: 1, ativo: true, origem: 'mao', ...o }; }

// perfis automáticos a partir dos pisos-base (não das variações) e das coisas no chão do nível
export function perfisAuto(v) {
  const pisos = (v.pisos || []).filter(x => x.ativo !== false), bases = pisos.filter(x => x.origem === 'mao' || !x.base || x.base === x.nome), pool = bases.length >= 2 ? bases : pisos;
  const de = (...ps) => pool.filter(x => ps.includes(x.papel)), aberto = pool.some(x => x.papel === 'externo') && !pool.some(x => x.padrao === 'carpete');
  let A = aberto ? de('externo') : de('principal', 'corredor'), F = aberto ? de('principal', 'corredor', 'sala') : de('sala').sort((a, b) => (b.padrao === 'tabuas') - (a.padrao === 'tabuas'));
  if (!A.length) A = pool; if (!F.length) F = pool.filter(x => !A.includes(x)); if (!F.length) F = pool;
  const perfis = [], vistos = new Set();
  for (let i = 0; i < Math.max(A.length, F.length) && perfis.length < 3; i++) { const a = A[i % A.length]; let f = F[i % F.length]; if (f === a && F.length > 1) f = F[(i + 1) % F.length];
    const k = a?.id + '|' + f?.id; if (!a || !f || vistos.has(k)) continue; vistos.add(k);
    perfis.push(perfilPisoNovo({ nome: `${a.nome} · ${f.nome}`, amplo: a.id, fechado: f.id, origem: 'auto' })); }
  const cobs = (v.coberturas || []).filter(c => c.ativo !== false), soFora = (c) => (c.onde || []).length && (c.onde || []).every(o => o === 'externo');
  const cA = aberto ? cobs : cobs.filter(c => !soFora(c)), cF = cobs.filter(c => !soFora(c)), pega = (l, i, n) => l.length ? [...new Set(Array.from({ length: Math.min(n, l.length) }, (_, k) => l[(i + k) % l.length].id))] : [];
  const coisas = cobs.length ? Array.from({ length: Math.min(3, Math.max(1, Math.ceil(cobs.length / 3))) }, (_, k) => { const a = pega(cA.length ? cA : cobs, k * 2, 2), f = pega(cF.length ? cF : cobs, k * 2 + 1, 2);
    const nm = (ids) => ids.map(id => cobs.find(c => c.id === id)?.nome).filter(Boolean).join(', ');
    return perfilCoisasNovo({ nome: `${nm(a) || '—'} | ${nm(f) || '—'}`, amplo: a, fechado: f, origem: 'auto' }); }) : [];
  return { perfis, perfisCoisas: coisas };
}
// os perfis feitos à mão continuam valendo depois de refazer a biblioteca: ids que sumiram são achados pelo nome
function remapear(perfis, velhos, novos, lista) {
  const nomeDe = Object.fromEntries((velhos || []).map(x => [x.id, x.nome])), idDe = Object.fromEntries((novos || []).map(x => [x.nome, x.id])), ok = new Set((novos || []).map(x => x.id));
  const m = (id) => ok.has(id) ? id : idDe[nomeDe[id]] ?? null;
  return perfis.map(p => ({ ...p, amplo: lista ? (p.amplo || []).map(m).filter(Boolean) : m(p.amplo), fechado: lista ? (p.fechado || []).map(m).filter(Boolean) : m(p.fechado) }));
}
export function comPerfis(v, antiga = null) {
  const mao = (l) => (l || []).filter(x => x.origem === 'mao'), auto = perfisAuto(v);
  v.perfis = [...remapear(mao(antiga?.perfis), antiga?.pisos, v.pisos), ...auto.perfis];
  v.perfisCoisas = [...remapear(mao(antiga?.perfisCoisas), antiga?.coberturas, v.coberturas, true), ...auto.perfisCoisas];
  v.perfil = { ...PERFIL_PADRAO, ...(antiga?.perfil || v.perfil || {}) };
  return v;
}

// espaços do layout: o chão numa grade de c metros; paredes (e os vãos de porta, fechados) separam; cada pedaço conectado
// é um espaço. Devolve a grade com o rótulo de cada célula e a área de cada espaço.
export function espacos(L, c = .5) {
  const W = L.largura, D = L.profundidade, nx = Math.ceil(W / c - 1e-6), nz = Math.ceil(D / c - 1e-6), X0 = -W / 2, Z0 = -D / 2, N = nx * nz, bloq = new Uint8Array(N);
  const marca = (x, z, rot, comp, esp) => { const a = rot * Math.PI / 180, ca = Math.floor(Math.cos(a) * 1e9 + .5) / 1e9, sa = Math.floor(Math.sin(a) * 1e9 + .5) / 1e9, hu = comp / 2 + c / 2, hw = esp / 2 + c / 2 + .01, R = Math.hypot(hu, hw);
    for (let i = Math.max(0, Math.floor((x - R - X0) / c)); i <= Math.min(nx - 1, Math.ceil((x + R - X0) / c)); i++)
      for (let j = Math.max(0, Math.floor((z - R - Z0) / c)); j <= Math.min(nz - 1, Math.ceil((z + R - Z0) / c)); j++) {
        const dx = X0 + (i + .5) * c - x, dz = Z0 + (j + .5) * c - z; if (Math.abs(dx * ca - dz * sa) <= hu && Math.abs(dx * sa + dz * ca) <= hw) bloq[j * nx + i] = 1; } };
  for (const p of L.paredes || []) { if ((p.alt ?? 2.6) < 1.4 || (p.comp === p.esp && p.comp < 1)) continue; marca(p.x, p.z, p.rot || 0, p.comp, p.esp ?? .2); }
  for (const d of acharPortas(L.paredes || [])) marca(d.x, d.z, d.rot, d.larg + .1, d.esp);
  const lab = new Int32Array(N).fill(-1), area = [], fila = new Int32Array(N);
  for (let s = 0; s < N; s++) { if (bloq[s] || lab[s] >= 0) continue; const id = area.length; let ini = 0, fim = 0; fila[fim++] = s; lab[s] = id;
    while (ini < fim) { const k = fila[ini++], i = k % nx, j = (k / nx) | 0;
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = b * nx + a; if (bloq[q] || lab[q] >= 0) continue; lab[q] = id; fila[fim++] = q; } }
    area.push(fim * c * c); }
  // espaço que encosta na borda do layout sem parede = aberto (dá para o vizinho ou para fora); os outros são cômodos fechados
  const borda = new Uint8Array(area.length); for (let i = 0; i < nx; i++) for (const j of [0, nz - 1]) if (lab[j * nx + i] >= 0) borda[lab[j * nx + i]] = 1;
  for (let j = 0; j < nz; j++) for (const i of [0, nx - 1]) if (lab[j * nx + i] >= 0) borda[lab[j * nx + i]] = 1;
  // debaixo das paredes: o espaço vizinho (a troca de piso fica escondida pela parede)
  let ini = 0, fim = 0; for (let k = 0; k < N; k++) if (lab[k] >= 0) fila[fim++] = k;
  if (!fim) { lab.fill(0); area.push(W * D); }
  while (ini < fim) { const k = fila[ini++], i = k % nx, j = (k / nx) | 0;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = b * nx + a; if (lab[q] >= 0) continue; lab[q] = lab[k]; fila[fim++] = q; } }
  return { c, nx, nz, X0, Z0, W, D, lab, area, borda, de: (x, z) => lab[Math.min(nz - 1, Math.max(0, Math.floor((z - Z0) / c))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((x - X0) / c)))] };
}
// cômodos FECHADOS do layout (cercados por paredes e portas, sem encostar na borda aberta): só neles nascem luminárias,
// como as salas dos níveis do jogo. Cada um: r = retângulos (com o chão debaixo das paredes), a = área útil (m²),
// p = o piso no meio do cômodo (o critério do tipo de luminária na Godot).
export function comodos(L, chao = L.chao) {
  const E = espacos(L), ok = E.area.map((a, k) => !E.borda[k] && a >= 1.5);
  if (!ok.some(Boolean)) return [];
  const val = new Int32Array(E.lab.length); for (let k = 0; k < val.length; k++) val[k] = ok[E.lab[k]] ? E.lab[k] : -1;
  const por = new Map();
  for (const g of retangulos(E, val)) { if (g.v < 0) continue; if (!por.has(g.v)) por.set(g.v, { r: [], a: +E.area[g.v].toFixed(1), p: null });
    por.get(g.v).r.push([+g.x0.toFixed(2), +g.z0.toFixed(2), +g.x1.toFixed(2), +g.z1.toFixed(2)]); }
  for (const cm of por.values()) { const ar = (q) => (q[2] - q[0]) * (q[3] - q[1]), b = cm.r.reduce((m, q) => ar(q) > ar(m) ? q : m), cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
    const g = (chao || []).find(g => cx >= g.x0 && cx <= g.x1 && cz >= g.z0 && cz <= g.z1); cm.p = g?.p ?? null;
    cm.amb = contexto(L, cx, cz).amb; cm.funcao = (L.salas || []).find(s => cx >= s.x0 && cx < s.x1 && cz >= s.z0 && cz < s.z1)?.funcao || ''; }
  return [...por.values()].filter(cm => cm.amb !== 'externo');
}
export const comComodos = (L) => L && !L.comodos ? Object.assign(L, { comodos: comodos(L) }) : L;
// grade de valores → retângulos (guloso: estica na linha, depois para baixo)
function retangulos(E, val) {
  const { nx, nz, c, X0, Z0, W, D } = E, usado = new Uint8Array(nx * nz), out = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (usado[k]) continue; const v = val[k]; let w = 1, h = 1;
    while (i + w < nx && !usado[k + w] && val[k + w] === v) w++;
    for (let ok = true; ok && j + h < nz; ) { for (let a = 0; a < w; a++) { const q = (j + h) * nx + i + a; if (usado[q] || val[q] !== v) { ok = false; break; } } if (ok) h++; }
    for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) usado[(j + b) * nx + i + a] = 1;
    out.push({ x0: X0 + i * c, z0: Z0 + j * c, x1: Math.min(W / 2, X0 + (i + w) * c), z1: Math.min(D / 2, Z0 + (j + h) * c), v }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ aplicar num layout
function rng(seed) { let a = (seed >>> 0) || 1; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.entre = (x, y) => x + (y - x) * r(); return r; }
const PREF = { principal: { principal: 6, sala: 1, externo: 0 }, sala: { sala: 4, principal: 2, detalhe: .2, externo: 0 }, corredor: { corredor: 5, principal: 2, externo: 0 }, detalhe: { detalhe: 6 }, externo: { externo: 5, principal: 0, sala: 0, corredor: 0, detalhe: 0, via: 0 }, via: { via: 6, externo: 0, principal: 0, sala: 0, corredor: 0, detalhe: 0 } };
// o ambiente da região que contém (x, z)
const regDeAmb = (regs, x, z) => regs.find(g => x >= g.x0 - .01 && x <= g.x1 + .01 && z >= g.z0 - .01 && z <= g.z1 + .01)?.amb;
// quais células da grade dos espaços (pisos.espacos) caem em zona externa
function celulasExternas(E, regs) {
  const out = new Array(E.lab.length).fill(false); if (!regs.some(g => g.amb === 'externo')) return out;
  for (let j = 0; j < E.nz; j++) for (let i = 0; i < E.nx; i++) out[j * E.nx + i] = regDeAmb(regs, E.X0 + (i + .5) * E.c, E.Z0 + (j + .5) * E.c) === 'externo';
  return out;
}
function sorteiaPeso(r, l) { if (!l.length) return null; let q = r() * l.reduce((a, x) => a + (x.peso ?? 1), 0); for (const x of l) if ((q -= x.peso ?? 1) <= 0) return x; return l[l.length - 1]; }
function sorteia(r, lista, papel) { const ws = lista.map(x => papel !== 'externo' && papel !== 'via' && ehDeFora(x) && papel !== 'detalheFora' ? 0 : (x.peso ?? 1) * ((PREF[papel === 'detalheFora' ? 'detalhe' : papel] || {})[x.papel] ?? .25)); let q = r() * ws.reduce((a, b) => a + b, 0);
  if (!ws.some(w => w > 0)) return lista.find(x => x.origem === 'criterio' && x.papel === papel) || lista.find(x => x.origem === 'criterio' && x.papel === 'principal');
  for (let i = 0; i < lista.length; i++) if (ws[i] > 0 && (q -= ws[i]) <= 0) return lista[i]; return lista[ws.findLastIndex(w => w > 0)]; }

// portas: vãos entre duas paredes alinhadas (o vão de 0,7 a 3,3 m numa mesma linha)
export function acharPortas(paredes) {
  const lin = new Map(), out = [];
  paredes.forEach(p => { if (p.comp === p.esp && p.comp < 1) return; const r = ((Math.round(p.rot) % 180) + 180) % 180; if (r !== 0 && r !== 90) return;
    const off = r === 0 ? p.z : p.x, k = r + ':' + off.toFixed(1); if (!lin.has(k)) lin.set(k, []); lin.get(k).push({ p, c: r === 0 ? p.x : -p.z, r }); });
  // o vão começa onde termina a parede que vai MAIS longe até ali (paredes sobrepostas na mesma linha, como as da mistura,
  // não abrem porta falsa por baixo de outra parede: no jogo a porta é um estado da aresta, nunca há parede no vão)
  for (const segs of lin.values()) { segs.sort((a, b) => a.c - b.c); let A = segs[0];
    for (let i = 0; i < segs.length - 1; i++) { if (segs[i].c + segs[i].p.comp / 2 > A.c + A.p.comp / 2) A = segs[i];
      const B = segs[i + 1], f = A.c + A.p.comp / 2, ini = B.c - B.p.comp / 2, gap = ini - f;
      if (gap < .7 || gap > 3.3 || Math.min(A.p.alt, B.p.alt) < 1.4) continue; const m = (f + ini) / 2;
      out.push({ x: +(A.r === 0 ? m : A.p.x).toFixed(3), z: +(A.r === 0 ? A.p.z : -m).toFixed(3), rot: A.r, larg: +gap.toFixed(3), alt: Math.min(A.p.alt, B.p.alt), esp: Math.max(A.p.esp, B.p.esp) }); } }
  return out.filter(d => vaoLivre(d, paredes));
}
// o vão está livre: nenhuma parede sólida entra na passagem (o vão sem 15 cm de cada batente × a espessura + 25 cm de cada lado).
// Linhas quase iguais (x = 0,05 e −0,05) caem em grupos diferentes: uma parede de uma delas pode cobrir o "vão" da outra
function vaoLivre(d, paredes) {
  const hu = d.larg / 2 - .15, hw = d.esp / 2 + .25, ax = d.rot === 0 ? hu : hw, az = d.rot === 0 ? hw : hu;
  for (const p of paredes) { if ((p.alt ?? 2.6) <= .3) continue; const r = ((Math.round(p.rot || 0) % 180) + 180) % 180, e = (p.esp ?? .2) / 2;
    if (r === 0 || r === 90) { const px = r === 0 ? p.comp / 2 : e, pz = r === 0 ? e : p.comp / 2;
      if (Math.abs(p.x - d.x) < px + ax && Math.abs(p.z - d.z) < pz + az) return false; continue; }
    const a = (p.rot || 0) * Math.PI / 180, dx = Math.cos(a), dz = -Math.sin(a), n = Math.max(1, Math.ceil(p.comp / .1));
    for (let q = 0; q <= n; q++) { const u = -p.comp / 2 + p.comp * q / n; if (Math.abs(p.x + dx * u - d.x) < ax + e && Math.abs(p.z + dz * u - d.z) < az + e) return false; } }
  return true;
}

// regiões do chão, piso de cada uma, estilo de cada parede e as portas. Determinístico pela semente do layout.
export function enfeitar(L, vis, funcoes = []) {
  vis = biblioteca(vis);
  const pisos = (vis?.pisos || []).filter(x => x.ativo !== false), pars = (vis?.paredes || []).filter(x => x.ativo !== false);
  if (!pisos.length) return L;
  const r = rng((L.semente || 1) * 7177 + [...(L.estilo || '')].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 3)), W = L.largura, D = L.profundidade;
  let regs = [];
  if (L.zonas?.length) { const porEstilo = {};
    for (const z of L.zonas) { const k = z.estilo; if (!porEstilo[k] || r() < .3) porEstilo[k] = { p: null, w: null };
      regs.push({ x0: z.x - z.w / 2, z0: z.z - z.d / 2, x1: z.x + z.w / 2, z1: z.z + z.d / 2, grupo: porEstilo[k], amb: z.amb }); } }
  else { const C = 3, cols = Math.max(1, Math.round(W / C)), rows = Math.max(1, Math.round(D / C)), cw = W / cols, cd = D / rows, alvo = r.entre(3, 7);
    const div = (i0, j0, i1, j1, p) => { const w = i1 - i0, d = j1 - j0;
      if (p > 0 && (w * d <= alvo || (w < 3 && d < 3) || r() < .12 * p)) { regs.push({ x0: -W / 2 + i0 * cw, z0: -D / 2 + j0 * cd, x1: -W / 2 + i1 * cw, z1: -D / 2 + j1 * cd, amb: L.amb }); return; }
      if (w >= d && w > 1) { const c = i0 + Math.max(1, Math.min(w - 1, Math.round(w * r.entre(.3, .7)))); div(i0, j0, c, j1, p + 1); div(c, j0, i1, j1, p + 1); }
      else if (d > 1) { const c = j0 + Math.max(1, Math.min(d - 1, Math.round(d * r.entre(.3, .7)))); div(i0, j0, i1, c, p + 1); div(i0, c, i1, j1, p + 1); }
      else regs.push({ x0: -W / 2 + i0 * cw, z0: -D / 2 + j0 * cd, x1: -W / 2 + i1 * cw, z1: -D / 2 + j1 * cd, amb: L.amb }); };
    div(0, 0, cols, rows, 0); }
  const [ix, iz] = L.inicio || [0, 0];
  // o ambiente manda no piso: zona externa (jardim, praça, campo…) pega piso e parede de fora; a interna nunca pega piso de fora
  regs.forEach(g => { const dentro = ix >= g.x0 && ix <= g.x1 && iz >= g.z0 && iz <= g.z1, estreita = Math.min(g.x1 - g.x0, g.z1 - g.z0) <= 3.1;
    const papel = g.amb === 'externo' ? 'externo' : dentro ? 'principal' : estreita ? 'corredor' : r() < .45 ? 'principal' : 'sala';
    if (g.grupo?.p) { g.p = g.grupo.p; g.w = g.grupo.w; return; }
    g.p = sorteia(r, pisos, papel).id; g.w = pars.length ? sorteia(r, pars, papel).id : null; if (g.grupo) { g.grupo.p = g.p; g.grupo.w = g.w; } });
  const porId = Object.fromEntries(pisos.map(x => [x.id, x])), cobId = Object.fromEntries((vis.coberturas || []).map(x => [x.id, x]));
  // perfis: um de piso e um de coisas por layout; o dado decide quanto foge
  const cfg = { ...PERFIL_PADRAO, ...(vis.perfil || {}) }, dado = cl(+cfg.dado || 0, 0, 1), lim = +cfg.limite || 60;
  const pp = cfg.usar ? sorteiaPeso(r, (vis.perfis || []).filter(x => x.ativo !== false && porId[x.amplo] && porId[x.fechado])) : null;
  const pc = cfg.usar ? sorteiaPeso(r, (vis.perfisCoisas || []).filter(x => x.ativo !== false && [...(x.amplo || []), ...(x.fechado || [])].some(id => cobId[id]))) : null;
  const E = pp || pc ? espacos(L) : null, tipo = E ? E.area.map(a => a >= lim ? 'amplo' : 'fechado') : null;
  let chao;
  if (pp) { const ext = celulasExternas(E, regs), extId = ext.some(Boolean) ? sorteia(r, pisos, 'externo').id : null; // célula em zona externa: o piso de fora
    const ids = E.area.map((a, k) => a >= 6 && r() < dado ? sorteia(r, pisos, tipo[k] === 'amplo' ? 'principal' : 'sala').id : pp[tipo[k]]), idx = Object.fromEntries(pisos.map((x, i) => [x.id, i]));
    const val = new Int32Array(E.lab.length); for (let k = 0; k < val.length; k++) val[k] = idx[ext[k] ? extId : ids[E.lab[k]]];
    // s: a semente do piso — todos os pedaços do mesmo piso são uma superfície só (sem emenda entre retângulos)
    chao = retangulos(E, val).map(g => ({ x0: +g.x0.toFixed(3), z0: +g.z0.toFixed(3), x1: +g.x1.toFixed(3), z1: +g.z1.toFixed(3), p: pisos[g.v].id, s: 1000 + g.v })); }
  else chao = regs.map(g => ({ x0: +g.x0.toFixed(3), z0: +g.z0.toFixed(3), x1: +g.x1.toFixed(3), z1: +g.z1.toFixed(3), p: g.p }));
  // detalhes por cima: tapetes, poças, remendos (com perfil, só na medida do dado)
  // faixas que o estilo marcou (a estrada: papel "via") ganham o piso da função, por cima do chão
  if ((L.faixas || []).length) { const via = {}; for (const [x0, z0, x1, z1, papel] of L.faixas) { via[papel] ||= sorteia(r, pisos, papel).id;
    const a0 = Math.max(-W / 2, x0), b0 = Math.max(-D / 2, z0), a1 = Math.min(W / 2, x1), b1 = Math.min(D / 2, z1); if (a1 - a0 > .05 && b1 - b0 > .05) chao.push({ x0: a0, z0: b0, x1: a1, z1: b1, p: via[papel] }); } }
  const det = pisos.filter(x => x.papel === 'detalhe'); if (det.length) for (let k = Math.round(W * D / 110 * r.entre(.5, 1.4) * (pp ? Math.min(1, dado * 1.5) : 1)); k > 0; k--) {
    const w = Math.round(r.entre(1.5, 4.5) * 2) / 2, d = Math.round(r.entre(1.5, 4) * 2) / 2, x = Math.round(r.entre(-W / 2, W / 2 - w) * 2) / 2, z = Math.round(r.entre(-D / 2, D / 2 - d) * 2) / 2;
    const fora = regDeAmb(regs, x + w / 2, z + d / 2) === 'externo', l = det.filter(q => ehDeFora(q) === fora); // tapete só dentro; lama e água só fora
    if (l.length) chao.push({ x0: x, z0: z, x1: x + w, z1: z + d, p: sorteia(r, l, fora ? 'detalheFora' : 'detalhe').id }); }
  const regDe = (x, z) => regs.find(g => x >= g.x0 - .01 && x <= g.x1 + .01 && z >= g.z0 - .01 && z <= g.z1 + .01) || regs[0];
  chao = chaoCoerente(L, chao, pisos);
  const paredes = (L.paredes || []).map(p => ({ ...p, e: escolherParede(pars, p.barreira || tipoBarreira(L.estilo, L.amb, L.tema)).id }));
  const cobre = espalharCoberturas({ ...L, chao, paredes }, vis.coberturas, porId, r, pc ? { pc, tipoDe: (x, z) => tipo[E.de(x, z)], dado } : null);
  const portas = acharPortas(paredes.filter(p => p.barreira !== 'sebe' && p.barreira !== 'muro'));
  const out = { ...L, chao, paredes, portas, cobre };
  out.camadas_chao = camadasChao(out, funcoes);
  Object.defineProperty(out, 'visual', { value: vis, enumerable: false }); // o visor lê; não vai para o JSON
  return out;
}

// ------------------------------------------------------------------------------------------------ cores e prévias 2D
// corDe(cls, v) → [r, g, b] 0–1 (a cor do jogo: matiz da classe normalizada × tom)
export function corDeHex(hexes) {
  const tab = {};
  for (const [k, hs] of Object.entries(hexes || {})) { let r = 0, g = 0, b = 0; for (const x of hs) { const n = parseInt(x.slice(1), 16); r += (n >> 16 & 255) / 255; g += (n >> 8 & 255) / 255; b += (n & 255) / 255; }
    const l = .299 * r + .587 * g + .114 * b; tab[k] = [r / l, g / l, b / l]; }
  const f = (cls, v) => { const hh = tab[cls] || tab.CL || [1, 1, 1]; let c = hh.map(x => x * v); const m = Math.max(...c); if (m > 1) c = c.map(x => x / m); return c; };
  f.tab = tab; return f;
}
const css = (c) => `rgb(${c.map(x => Math.round(cl(x, 0, 1) * 255)).join(',')})`;
export const cssDe = (cor, cls, v) => css(cor(cls, v));

// o piso visto de cima, numa janela de lado×lado metros. Devolve o ImageData (para a prévia com a cor do jogo)
export function desenharPiso(cv, s, cor, { lado = 3, seed = 1 } = {}) {
  const g = cv.getContext('2d'), W = cv.width, k = W / lado;
  if (s.padrao === 'organico') { const n = 48, c = lado / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const [cls, v] = tomOrganico(s, (i + .5) * c, (j + .5) * c, seed);
      g.fillStyle = css(cor(cls, v)); g.fillRect(Math.floor(i * W / n), Math.floor(j * W / n), Math.ceil(W / n), Math.ceil(W / n)); } return g.getImageData(0, 0, W, cv.height); }
  const qs = quadsPiso(s, 0, 0, lado, lado, seed), passo = lado / 24;
  const px = (a) => Math.round(a * k), passo2 = s.ruido ? passo : 1e9;
  for (const [x0, z0, x1, z1, ci, v] of qs) {
    const cls = clsDe(s, ci);
    for (let xa = x0; xa < x1 - 1e-6;) { const xb = Math.min(x1, (Math.floor(xa / passo2 + 1e-6) + 1) * passo2);
      for (let za = z0; za < z1 - 1e-6;) { const zb = Math.min(z1, (Math.floor(za / passo2 + 1e-6) + 1) * passo2);
        g.fillStyle = css(cor(cls, v * mancha(s, (xa + xb) / 2, (za + zb) / 2, seed))); g.fillRect(px(xa), px(za), Math.max(1, px(xb) - px(xa)), Math.max(1, px(zb) - px(za))); za = zb; }
      xa = xb; }
  }
  return g.getImageData(0, 0, W, cv.height);
}
// a parede vista de cima (capa) e de frente, num canvas largo: 3 m de parede
export function desenharParede(cv, s, cor, { comp = 3, alt = 2.6, esp = .2 } = {}) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / (comp + .6), ox = .3 * k;
  g.fillStyle = '#1d1c20'; g.fillRect(0, 0, W, H);
  const ps = pecasParede(s, comp, alt, esp, 1, comp / 2), topoY = 10, frenteY = topoY + (esp + .3) * k + 14;
  // de cima: a espessura (b) vira altura da faixa; peças mais altas por cima
  for (const q of [...ps].sort((a, b) => a[4] - b[4])) { const [a0, , b0, a1, y1, b1, cls, v] = q; g.fillStyle = css(cor(cls, v)); g.fillRect(ox + (a0 + comp / 2) * k, topoY + (b0 + esp / 2 + .15) * k, (a1 - a0) * k, (b1 - b0) * k); }
  // de frente: só o que encosta na face da frente
  const fk = (H - frenteY - 6) / (alt + .1);
  for (const q of [...ps].sort((a, b) => a[5] - b[5])) { const [a0, y0, , a1, y1, , cls, v] = q; g.fillStyle = css(cor(cls, v * .9)); g.fillRect(ox + (a0 + comp / 2) * k, H - 6 - y1 * fk, (a1 - a0) * k, (y1 - y0) * fk); }
  g.fillStyle = '#8a8590'; g.font = '11px system-ui'; g.fillText('de cima', 4, topoY - 1 + 9); g.fillText('de frente', 4, frenteY - 2);
}

// ------------------------------------------------------------------------------------------------ extrair de um recorte de imagem (sem IA)
function kmedias(px, k) {
  let cs = [...px].sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / k)) === 0).slice(0, k);
  for (let it = 0; it < 10; it++) { const soma = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) { let b = 0, bd = 1e9; cs.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = i; } }); const s = soma[b]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
    cs = cs.map((c, i) => soma[i][3] ? soma[i].slice(0, 3).map(v => v / soma[i][3]) : c).map((c, i) => [...c.slice(0, 3), soma[i][3]]); }
  return cs;
}
// a cor → classe do jogo + tom
export function classeDe(rgb, cor) {
  const l = .299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2]; let best = 'CL', bd = 1e9;
  for (const [k, hh] of Object.entries(cor.tab || {})) { if (k === 'PE') continue; const d = hh.reduce((s, x, i) => s + (x - rgb[i] / Math.max(l, .02)) ** 2, 0); if (d < bd) { bd = d; best = k; } }
  return { cls: best, v: +cl(l, .05, 1.2).toFixed(2) };
}
// periodicidade da luminância (autocorrelação) → tamanho da peça em px, ou 0
function periodo(lum, w, h, eixo) {
  const n = eixo ? h : w, m = eixo ? w : h, perfil = new Float64Array(n);
  for (let a = 0; a < n; a++) { let s = 0; for (let b = 0; b < m; b++) s += eixo ? lum[a * w + b] : lum[b * w + a]; perfil[a] = s / m; }
  const med = perfil.reduce((s, x) => s + x, 0) / n; for (let a = 0; a < n; a++) perfil[a] -= med;
  const ac = (L) => { let s = 0; for (let a = 0; a + L < n; a++) s += perfil[a] * perfil[a + L]; return s / (n - L); }, a0 = ac(0) || 1;
  let melhor = 0, mv = .25;
  for (let L = 4; L < n / 2; L++) { const v = ac(L) / a0; if (v > mv && v >= ac(L - 1) / a0 && v >= ac(L + 1) / a0) { melhor = L; mv = v; break; } }
  return melhor;
}
// img: ImageData do recorte; larguraM: quantos metros o recorte tem na horizontal
export function extrairPiso(img, larguraM, cor) {
  const { width: w, height: hh, data } = img, px = [], lum = new Float64Array(w * hh);
  for (let i = 0; i < w * hh; i++) { const c = [data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255]; lum[i] = .299 * c[0] + .587 * c[1] + .114 * c[2]; if (i % 3 === 0) px.push(c); }
  const cs = kmedias(px, 3).sort((a, b) => b[3] - a[3]), A = classeDe(cs[0], cor), B = classeDe(cs[1] || cs[0], cor);
  const escuro = [...cs].sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))[0], J = classeDe(escuro, cor);
  const pxM = w / Math.max(.1, larguraM), px1 = periodo(lum, w, hh, 0), px2 = periodo(lum, w, hh, 1), per = [px1, px2].filter(Boolean);
  const tam = per.length ? +(Math.min(...per) / pxM).toFixed(2) : +(larguraM / 2).toFixed(2), alongado = px1 && px2 && Math.max(px1, px2) / Math.min(px1, px2) > 2.2;
  const contraste = Math.abs(A.v - B.v), media = lum.reduce((s, x) => s + x, 0) / lum.length; let dv = 0; for (const x of lum) dv += (x - media) ** 2; dv = Math.sqrt(dv / lum.length);
  const padrao = !per.length ? (contraste > .15 ? 'manchas' : 'liso') : alongado ? 'tabuas' : contraste > .3 && (cs[1]?.[3] || 0) > (cs[0][3] * .6) ? 'xadrez' : 'ladrilho';
  const pd = PADROES_PISO[padrao];
  return { padrao, tam: padrao === 'tabuas' ? +(Math.max(px1, px2) / pxM / 4).toFixed(2) || .2 : Math.max(.15, tam), gap: per.length ? Math.max(.006, Math.min(.05, tam * .04)) : pd.gap,
           cls: A.cls, v: A.v, cls2: B.cls, v2: B.v, junta: J.v, variacao: +cl(dv * 2.5, .05, .8).toFixed(2), ruido: +cl(dv * 3, .1, .9).toFixed(2), gasto: pd.gasto };
}
// o recorte vira um desenho n×n com as 4 tintas (A, B, rejunte, escuro)
export function extrairDesenho(img, n, s, cor) {
  const { width: w, height: hh, data } = img, px = Array(n * n).fill(0), alvo = [cor(s.cls, s.v), cor(s.cls2 || s.cls, s.v2 ?? s.v), cor(s.cls, s.junta ?? s.v * .55), cor('AZ', .1)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let r = 0, g = 0, b = 0, c = 0;
    for (let yy = Math.floor(y * hh / n); yy < Math.floor((y + 1) * hh / n); yy++) for (let xx = Math.floor(x * w / n); xx < Math.floor((x + 1) * w / n); xx++) { const o = (yy * w + xx) * 4; r += data[o]; g += data[o + 1]; b += data[o + 2]; c++; }
    const m = [r / c / 255, g / c / 255, b / c / 255]; let bi = 0, bd = 1e9; alvo.forEach((t, i) => { const d = (t[0] - m[0]) ** 2 + (t[1] - m[1]) ** 2 + (t[2] - m[2]) ** 2; if (d < bd) { bd = d; bi = i; } }); px[y * n + x] = bi; }
  return { n, px };
}

// ------------------------------------------------------------------------------------------------ coisas no chão (cobertura)
// cobertura = {id, nome, tipo, cls, v, cls2, v2, densidade 0–1, tam (escala), arranjo, onde: [papéis de piso] | ['todos'], peso, ativo}
// Cada cobertura vira 3 PEDAÇOS de 3×3 m (receitas de primitivas, as mesmas do objeto padrão) que o layout espalha
// pelas células do chão. Na Godot cada pedaço é uma malha só, instanciada (barato).
export const PED = 3;
const prt = (f, p, cls, v, seg = 6, sy = 1) => ({ f, p: p.map(x => +(+x).toFixed(3)), cls, v: +Math.max(.02, Math.min(1.3, v)).toFixed(3), seg, sy });
const giro = (r) => r() * 360;
let F0 = ALT.chato; // base das coisas chatas desta cobertura (pedacoCobertura acerta pela camada)
const ch = (r, n = 0) => F0 + n * .002 + Math.floor(r() * 3) * .002; // degrau por item: folhas e papéis empilhados não coincidem
const trilha = (r, x, z, n, passo, curva, y, esp, cls, v) => { const o = []; let a = r() * 6.3, px = x, pz = z;
  for (let i = 0; i < n; i++) { const nx = px + Math.cos(a) * passo, nz = pz + Math.sin(a) * passo; o.push(prt('viga', [px, y, pz, nx, y, nz, esp], cls, v)); px = nx; pz = nz; a += (r() - .5) * curva; } return o; };
export const TIPOS_COBERTURA = {
  capim: { nome: 'Capim', dica: 'tufos baixos', dens: 3, cls: 'VG', v: .4, onde: ['externo'], item(r, x, z, c, k) { const o = []; for (let i = 0; i < 3; i++) { const h = (.12 + r() * .25) * k; o.push(prt('viga', [x, 0, z, x + (r() - .5) * .14 * k, h, z + (r() - .5) * .14 * k, .035 * k], c.cls, c.v * (.75 + r() * .5))); } return o; } },
  mato: { nome: 'Mato alto', dica: 'touceiras altas', dens: 1.2, cls: 'FE', v: .45, cls2: 'VG', v2: .4, onde: ['externo'], item(r, x, z, c, k) { const o = []; for (let i = 0; i < 6; i++) { const h = (.35 + r() * .45) * k, a = r() * 6.3, d = r() * .15; o.push(prt('viga', [x + Math.cos(a) * d, 0, z + Math.sin(a) * d, x + Math.cos(a) * (d + .2 * k), h, z + Math.sin(a) * (d + .2 * k), .04 * k], i % 3 ? c.cls : c.cls2 || c.cls, c.v * (.7 + r() * .6))); } return o; } },
  flores: { nome: 'Flores / roseiral', dica: 'haste, folhas e flor; em fileiras vira plantação', dens: 2.5, cls: 'VG', v: .4, cls2: 'AC', v2: .9, onde: ['externo'], arranjo: 'fileiras', item(r, x, z, c, k) { const h = (.3 + r() * .2) * k, t = (r() - .5) * .08;
    return [prt('viga', [x, 0, z, x + t, h, z + t, .025 * k], c.cls, c.v * .8), prt('esfera', [x - .06 * k, h * .5, z, .07 * k], c.cls, c.v, 6, .5), prt('esfera', [x + .06 * k, h * .65, z, .06 * k], c.cls, c.v * 1.1, 6, .5), prt('esfera', [x + t, h + .03 * k, z + t, .055 * k], c.cls2 || 'AC', c.v2 ?? .9, 6, .9)]; } },
  arbustos: { nome: 'Arbustos', dica: 'moitas redondas', dens: .25, cls: 'VG', v: .35, onde: ['externo'], item(r, x, z, c, k) { const s = (.25 + r() * .3) * k; return [prt('esfera', [x, s * .6, z, s], c.cls, c.v, 6, .75), prt('esfera', [x + s * .5, s * .4, z - s * .3, s * .6], c.cls, c.v * 1.15, 6, .7)]; } },
  folhas: { nome: 'Folhas secas', dica: 'folhinhas espalhadas', dens: 6, cls: 'PD', v: .55, cls2: 'FE', v2: .5, onde: ['todos'], item(r, x, z, c, k) { const s = (.04 + r() * .04) * k, b = r() < .5; return [prt('caixa_girada', [x, z, giro(r), -s, ch(r), -s * .6, s, ch(r) + .004, s * .6], b ? c.cls : c.cls2 || c.cls, (b ? c.v : c.v2 ?? c.v) * (.8 + r() * .4))]; } },
  papeis: { nome: 'Papéis', dica: 'folhas de papel no chão', dens: .5, cls: 'N', v: .95, onde: ['sala', 'corredor', 'principal'], item(r, x, z, c, k) { return [prt('caixa_girada', [x, z, giro(r), -.105 * k, ch(r), -.15 * k, .105 * k, ch(r) + .003, .15 * k], c.cls, c.v * (.85 + r() * .2))]; } },
  entulho: { nome: 'Entulho', dica: 'pedaços de concreto e tijolo', dens: .8, cls: 'CL', v: .5, cls2: 'PD', v2: .45, onde: ['todos'], item(r, x, z, c, k) { const o = []; for (let i = 0; i < 3; i++) { const s = (.05 + r() * .16) * k, a = r() * 6.3, d = r() * .25, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    o.push(r() < .55 ? prt('caixa_girada', [px, pz, giro(r), -s, 0, -s * .7, s, s * (.4 + r()), s * .7], i ? c.cls2 || c.cls : c.cls, c.v * (.7 + r() * .5)) : prt('esfera', [px, s * .3, pz, s], c.cls, c.v * (.7 + r() * .4), 5, .55)); } return o; } },
  pedras: { nome: 'Pedras', dica: 'pedras soltas', dens: .7, cls: 'PD', v: .5, onde: ['externo'], item(r, x, z, c, k) { const s = (.05 + r() * .18) * k; return [prt('esfera', [x, s * .25, z, s], c.cls, c.v * (.7 + r() * .5), 5, .55)]; } },
  cascalho: { nome: 'Cascalho', dica: 'pedrinhas miúdas', dens: 8, cls: 'CL', v: .6, onde: ['externo', 'corredor'], item(r, x, z, c, k) { const s = (.02 + r() * .03) * k; return [prt('esfera', [x, s * .2, z, s], c.cls, c.v * (.7 + r() * .6), 4, .6)]; } },
  pocas: { nome: 'Poças', dica: 'água parada', dens: .12, cls: 'CY', v: .7, onde: ['todos'], item(r, x, z, c, k) { const s = (.3 + r() * .7) * k; return [prt('cilindro', [x, z, s, F0 - .003, F0, s], c.cls, c.v, 7), prt('cilindro', [x + s * .6, z + s * .3, s * .6, F0, F0 + .003, s * .6], c.cls, c.v * 1.05, 7)]; } },
  // óleo: poça irregular (discos sobrepostos de um tom só, para não tremer) com um miolo mais escuro e um escorrido;
  // nasce junto de máquinas, carros e móveis, em chão de dentro ou no asfalto — nunca na grama
  sujeira: { nome: 'Manchas de óleo', dica: 'poças escuras irregulares, junto de máquinas e carros', dens: .2, cls: 'AZ', v: .16, onde: ['principal', 'sala', 'corredor', 'via'], arranjo: 'objetos', item(r, x, z, c, k) {
    const s = (.25 + r() * .35) * k, v = c.v * (.85 + r() * .3), o = [prt('cilindro', [x, z, s, F0 - .003, F0, s], c.cls, v, 10)];
    for (let i = 0; i < 4; i++) { const a = r() * 6.3, d = s * (.45 + r() * .5), q = s * (.35 + r() * .4); o.push(prt('cilindro', [x + Math.cos(a) * d, z + Math.sin(a) * d, q, F0 - .003, F0, q], c.cls, v, 9)); }
    o.push(prt('cilindro', [x + s * .1, z - s * .1, s * .45, F0, F0 + .004, s * .45], c.cls, v * .55, 9)); // o miolo, 4 mm acima: sem disputar o mesmo plano
    const a = r() * 6.3; for (let i = 1; i <= 3; i++) { const q = s * (.22 - i * .04); o.push(prt('cilindro', [x + Math.cos(a) * s * (1 + i * .45), z + Math.sin(a) * s * (1 + i * .45), q, F0 - .003, F0, q], c.cls, v, 7)); }
    return o; } },
  // rachadura: placas chatas rentes ao chão (nada em pé), larga na origem (7 cm, legível na câmera do jogo) e afinando até
  // 1 cm, dois braços saindo de um lascado, galhos que afinam; só em piso duro (nunca na grama)
  rachaduras: { nome: 'Rachaduras', dica: 'trincas no piso duro: largas na origem, afinando, com galhos e um lascado', dens: .25, cls: 'AZ', v: .1, onde: ['principal', 'sala', 'corredor', 'via'], item(r, x, z, c, k) {
    const y = F0 + .001, o = [], seg = (ax, az, bx, bz, w) => { const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      o.push(prt('caixa_girada', [(ax + bx) / 2, (az + bz) / 2, Math.atan2(-dz, dx) * 180 / Math.PI, -L / 2 - w * .4, y, -w / 2, L / 2 + w * .4, y + .002, w / 2], c.cls, c.v)); };
    const ramo = (px, pz, a, n, w0, passo) => { for (let i = 0; i < n; i++) { const w = w0 * (1 - i / n) + .01 * k, l = passo * (.6 + r() * .8), nx = px + Math.cos(a) * l, nz = pz + Math.sin(a) * l;
        seg(px, pz, nx, nz, w); px = nx; pz = nz; a += (r() < .5 ? -1 : 1) * (.25 + r() * .7);
        if (r() < .3 && n - i > 2) ramo(px, pz, a + (r() < .5 ? -1 : 1) * (.7 + r() * .6), Math.ceil((n - i) / 2), w * .55, passo * .75); } };
    const a = r() * 6.3; ramo(x, z, a, 6, .06 * k, .22 * k); ramo(x, z, a + Math.PI + (r() - .5) * .8, 4, .045 * k, .2 * k);
    o.push(prt('caixa_girada', [x, z, giro(r), -.07 * k, y + .002, -.05 * k, .07 * k, y + .004, .05 * k], c.cls, c.v * .7)); // o lascado, por cima (sem disputar o plano)
    return o; } },
  // Cabo solto é uma peça deliberada de manutenção, não uma cobertura espalhada pelo nível.
  cabos: { nome: 'Cabo solto', dica: 'cabo flexível para colocação manual junto de equipamento', dens: 0, cls: 'AZ', v: .22, cls2: 'AZ', v2: .3, onde: ['sala', 'principal'], pedaco(r, c, k) {
    const o = [], escala = Math.min(1, k), diam = .018 * escala, y = F0 + diam / 2 + .003, folga = (.32 + r() * .3) * escala;
    const ponto = t => [-1.15 * escala + 2.3 * escala * t, y, Math.sin(t * Math.PI * 2) * folga];
    for (let i = 0; i < 48; i++) o.push(prt('tubo', [...ponto(i / 48), ...ponto((i + 1) / 48), diam], c.cls, c.v, 8));
    for (const t of [0, 1]) { const p = ponto(t), a = ponto(t ? .98 : .02), dx = p[0] - a[0], dz = p[2] - a[2], len = Math.hypot(dx, dz);
      o.push(prt('tubo', [p[0], y, p[2], p[0] + dx / len * .05, y, p[2] + dz / len * .05, diam * 1.8], c.cls2 || c.cls, c.v2 ?? c.v, 8)); }
    return o; } },
  raizes: { nome: 'Raízes', dica: 'raízes rasteiras', dens: .15, cls: 'PD', v: .3, onde: ['externo'], item(r, x, z, c, k) { const o = []; for (let i = 0; i < 4; i++) { const a = r() * 6.3, l = (.4 + r() * .6) * k; o.push(prt('viga', [x, .06 * k, z, x + Math.cos(a) * l, 0, z + Math.sin(a) * l, .05 * k], c.cls, c.v * (.8 + r() * .4))); } return o; } },
  vidro: { nome: 'Vidro quebrado', dica: 'cacos que brilham', dens: 2, cls: 'CY', v: 1.1, onde: ['todos'], item(r, x, z, c, k) { const s = (.02 + r() * .04) * k; return [prt('caixa_girada', [x, z, giro(r), -s, ch(r), -s * .5, s, ch(r) + .004, s * .5], c.cls, c.v * (.85 + r() * .3))]; } },
  lixo: { nome: 'Lixo', dica: 'latas, garrafas e papel amassado', dens: .5, cls: 'AC', v: .7, cls2: 'N', v2: .9, onde: ['todos'], item(r, x, z, c, k) { const q = r();
    if (q < .4) return [prt('cilindro', [x, z, .035 * k, 0, .12 * k, .035 * k], c.cls, c.v * (.7 + r() * .5), 6)];
    if (q < .7) return [prt('viga', [x, .03 * k, z, x + .2 * k * Math.cos(q * 20), .03 * k, z + .2 * k * Math.sin(q * 20), .06 * k], 'CY', .55)];
    return [prt('esfera', [x, .04 * k, z, .05 * k], c.cls2 || 'N', c.v2 ?? .9, 5, .8)]; } },
  caixas: { nome: 'Caixas de papelão', dica: 'caixas largadas, às vezes empilhadas', dens: .1, cls: 'PD', v: .6, onde: ['sala', 'principal', 'corredor'], item(r, x, z, c, k) { const s = (.2 + r() * .2) * k, hh = s * (.6 + r() * .6), g = giro(r), o = [prt('caixa_girada', [x, z, g, -s, 0, -s * .8, s, hh, s * .8], c.cls, c.v * (.85 + r() * .3))];
    if (r() < .35) o.push(prt('caixa_girada', [x, z, g + (r() - .5) * 30, -s * .7, hh, -s * .6, s * .7, hh * 1.8, s * .6], c.cls, c.v * 1.08)); return o; } },
  musgo: { nome: 'Musgo', dica: 'manchas verdes rasteiras', dens: .9, cls: 'VG', v: .3, onde: ['externo'], arranjo: 'beiradas', item(r, x, z, c, k) { const s = (.1 + r() * .25) * k; return [prt('cilindro', [x, z, s, F0 - .003, ch(r), s * .8], c.cls, c.v * (.8 + r() * .4), 6)]; } },
  cogumelos: { nome: 'Cogumelos', dica: 'cogumelos pequenos em grupos', dens: .6, cls: 'N', v: .85, cls2: 'AC', v2: .7, onde: ['externo'], arranjo: 'aglomerado', item(r, x, z, c, k) { const hh = (.04 + r() * .06) * k; return [prt('cilindro', [x, z, .012 * k, 0, hh, .012 * k], c.cls, c.v, 5), prt('esfera', [x, hh, z, .03 * k], c.cls2 || c.cls, c.v2 ?? c.v, 5, .5)]; } },
  lama: { nome: 'Lama', dica: 'manchas de barro', dens: .2, cls: 'PD', v: .3, onde: ['externo'], item(r, x, z, c, k) { const s = (.3 + r() * .6) * k; return [prt('cilindro', [x, z, s, F0 - .003, ch(r), s * .9], c.cls, c.v * (.8 + r() * .3), 7)]; } },
  ladrilhos: { nome: 'Ladrilhos soltos', dica: 'peças do piso arrancadas', dens: .3, cls: 'CL', v: .7, onde: ['sala', 'principal', 'corredor'], item(r, x, z, c, k) { const s = .15 * k; return [prt('caixa_girada', [x, z, giro(r), -s, F0 - .01, -s, s, ch(r) + .004, s], c.cls, c.v * (.8 + r() * .3))]; } },
  faixas: { nome: 'Faixas pintadas', dica: 'marcas de piso: vagas, faixas', dens: 0, cls: 'N', v: 1, onde: ['corredor', 'externo', 'via'], pedaco(r, c, k) { const o = [], vert = r() < .5, w = .1 * k;
    for (let i = -1; i <= 1; i++) { const u = i * 1.2; o.push(prt('caixa', vert ? [u - w / 2, F0 - .003, -1.4, u + w / 2, F0, 1.4] : [-1.4, F0 - .003, u - w / 2, 1.4, F0, u + w / 2], c.cls, c.v)); } return o; } },
  ralos: { nome: 'Ralos e grelhas', dica: 'grelhas e tampas no chão', dens: 0, cls: 'AZ', v: .15, cls2: 'CL', v2: .45, onde: ['todos'], pedaco(r, c, k) { const s = (.25 + r() * .3) * k, x = (r() - .5) * 2, z = (r() - .5) * 2, o = [prt('caixa', [x - s, F0 - .003, z - s, x + s, F0, z + s], c.cls, c.v)];
    for (let i = -2; i <= 2; i++) o.push(prt('caixa', [x - s, F0, z + i * s * .35 - .015, x + s, F0 + .005, z + i * s * .35 + .015], c.cls2 || 'CL', c.v2 ?? .45)); return o; } },
};
export const ARRANJOS = { espalhado: 'espalhado por igual', aglomerado: 'em manchas', fileiras: 'em fileiras (plantação)', beiradas: 'nas beiradas e junto às paredes', objetos: 'junto dos objetos (máquinas, carros, móveis)' };

export function coberturaNova(o = {}) { const tipo = TIPOS_COBERTURA[o.tipo] ? o.tipo : 'capim', t = TIPOS_COBERTURA[tipo];
  return { id: nid('co'), nome: t.nome, cls: t.cls, v: t.v, cls2: t.cls2 || t.cls, v2: t.v2 ?? t.v, densidade: .5, tam: 1, arranjo: t.arranjo || 'aglomerado', onde: [...t.onde], peso: 1, ativo: true, origem: 'mao', ...o, tipo }; }

// um pedaço de 3×3 m (centrado na origem) desta cobertura: lista de partes de receita
// camada: o índice da cobertura no nível — cada uma tem sua faixa de altura para as chatas (poça sobre sujeira não pisca)
export function pedacoCobertura(c, variante = 0, camada = 0) {
  F0 = ALT.chato + (camada % 4) * ALT.faixa;
  const t = TIPOS_COBERTURA[c.tipo] || TIPOS_COBERTURA.capim, k = +c.tam || 1, r = rng((([...String(c.id)].reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7)) >>> 0) + variante * 9973);
  if (t.pedaco) return t.pedaco(r, c, k);
  const hp = PED / 2, d = c.densidade ?? .5, n = Math.round(t.dens * PED * PED * (.25 + d * 1.5)), out = [];
  if (c.arranjo === 'fileiras') { const dz = .75 * k, dx = .375 * k;
    for (let z = -hp + dz / 2, row = 0; z < hp; z += dz, row++) for (let x = -hp + dx / 2 + (row % 2) * dx / 2; x < hp && out.length < 900; x += dx) {
      if (r() > .35 + d * .65) continue; out.push(...t.item(r, x + (r() - .5) * .08, z + (r() - .5) * .08, c, k)); } }
  else for (let i = 0; i < n && out.length < 900; i++) { let x = (r() - .5) * PED, z = (r() - .5) * PED;
    if (c.arranjo === 'aglomerado' && i % 3) { const a = r() * 6.3, dd = Math.abs(r() + r() - 1) * .9; x = Math.max(-hp, Math.min(hp, Math.cos(a) * dd + (i % 5 - 2) * .4)); z = Math.max(-hp, Math.min(hp, Math.sin(a) * dd)); }
    out.push(...t.item(r, x, z, c, k)); }
  return out;
}
// onde cada cobertura pousa: [índice, variante, x, z, rot] nas células de 3 m do chão
// perfil = {pc (perfil de coisas), tipoDe(x, z) → 'amplo' | 'fechado', dado}: cada célula usa só as coisas do perfil
// para aquele tipo de espaço (o "onde" de cada coisa fica de lado); com a chance do dado, a célula foge e vale tudo
// coisa de fora só em piso de fora, coisa de dentro só em piso de dentro ('todos' vai em qualquer um)
const combina = (onde, papel) => onde.includes('todos') || (papel === 'externo' || papel === 'via' ? onde.includes(papel) : onde.some(o => o !== 'externo' && o !== 'via'));
export function espalharCoberturas(L, cobs, pisosPorId, r, perfil = null) {
  const ativos = (cobs || []).map((c, i) => [c, i]).filter(([c]) => c.tipo !== 'cabos' && c.ativo !== false && (c.densidade ?? .5) > 0); if (!ativos.length) return [];
  const W = L.largura, D = L.profundidade, out = [], chao = L.chao || [], regDe = (x, z) => { for (let i = chao.length - 1; i >= 0; i--) { const g = chao[i]; if (x >= g.x0 && x < g.x1 && z >= g.z0 && z < g.z1 && pisosPorId[g.p]?.papel !== 'detalhe') return g; } return null; };
  const perto = (x, z) => (L.paredes || []).some(p => { const a = p.rot * Math.PI / 180, dx = x - p.x, dz = z - p.z, u = dx * Math.cos(a) - dz * Math.sin(a), w = dx * Math.sin(a) + dz * Math.cos(a); return Math.abs(u) < p.comp / 2 + .5 && Math.abs(w) < 1.7; })
    || Math.abs(Math.abs(x) - W / 2) < 1.6 || Math.abs(Math.abs(z) - D / 2) < 1.6;
  const pertoObj = (x, z) => (L.instancias || []).some(i => Math.abs(i.x - x) < 1.8 && Math.abs(i.z - z) < 1.8);
  for (let x = -W / 2 + PED / 2; x < W / 2; x += PED) for (let z = -D / 2 + PED / 2; z < D / 2; z += PED) {
    const g = regDe(x, z), papel = pisosPorId[g?.p]?.papel || 'principal'; let n = 0;
    for (let s = ativos.length - 1; s > 0; s--) { const j = Math.floor(r() * (s + 1)); [ativos[s], ativos[j]] = [ativos[j], ativos[s]]; }
    const doPerfil = perfil && r() >= perfil.dado ? new Set(perfil.pc[perfil.tipoDe(x, z)] || []) : null;
    for (const [c, i] of ativos) {
      if (n >= 2) break; const onde = c.onde || ['todos'];
      if (doPerfil) { if (!doPerfil.has(c.id) || !combina(onde, papel)) continue; } else if (!onde.includes('todos') && !onde.includes(papel)) continue;
      let p = (c.densidade ?? .5) * (c.peso ?? 1) * .8;
      if (c.arranjo === 'aglomerado') p *= fbm(x * .11 + i * 7.3, z * .11 - i * 3.1, 2, 41) > .5 ? 1.8 : .12;
      if (c.arranjo === 'beiradas') p *= perto(x, z) ? 1.6 : .06;
      if (c.arranjo === 'objetos') p *= pertoObj(x, z) ? 2.4 : 0;
      if (c.arranjo === 'fileiras') p *= fbm(x * .07 + i, z * .07, 2, 43) > .42 ? 1.7 : 0;
      if (r() >= p) continue; n++;
      out.push([i, Math.floor(r() * 3), +x.toFixed(2), +z.toFixed(2), c.arranjo === 'fileiras' ? Math.floor(r() * 2) * 180 : Math.floor(r() * 4) * 90]); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ coisas nas paredes
// Quadros, pôsteres, figuras, relógios, quadros de avisos e placas nas paredes (Ground Maker → Coisas nas paredes:
// visual.quadros). Onde: sorteio fixo ao longo de cada parede, dos dois lados, em vagas de 1,5 m; fora da frente das
// portas e de móveis encostados; "nos cômodos" = só o lado de dentro de um cômodo fechado. Porte em ForjaNivel
// (godot_nivel.py _quadros): a mesma conta, para a Forja e o jogo mostrarem igual.
export const TIPOS_QUADRO = {
  quadro: { nome: 'Quadro', dica: 'moldura e tela com manchas de pintura', largura: .9, altura: .65, y: 1.55, cls: 'VG', v: .45, cls2: 'PD', v2: .35, densidade: .25, onde: 'comodos' },
  poster: { nome: 'Pôster', dica: 'folha colada, com faixa de título e um bloco de imagem', largura: .6, altura: .85, y: 1.5, cls: 'N', v: .9, cls2: 'AC', v2: .7, densidade: .2, onde: 'todas' },
  figura: { nome: 'Figura emoldurada', dica: 'retrato ou foto pequena, moldura fina', largura: .35, altura: .45, y: 1.6, cls: 'CY', v: .7, cls2: 'N', v2: .15, densidade: .2, onde: 'comodos' },
  relogio: { nome: 'Relógio de parede', dica: 'aro, mostrador claro e ponteiros', largura: .34, altura: .34, y: 2.0, cls: 'N', v: .95, cls2: 'N', v2: .12, densidade: .06, onde: 'comodos' },
  avisos: { nome: 'Quadro de avisos', dica: 'cortiça com papéis presos', largura: 1.1, altura: .75, y: 1.45, cls: 'N', v: .95, cls2: 'PD', v2: .55, densidade: .1, onde: 'corredores' },
  placa: { nome: 'Placa', dica: 'placa de sala ou de saída, alta na parede', largura: .6, altura: .18, y: 2.05, cls: 'CL', v: .9, cls2: 'N', v2: .2, densidade: .08, onde: 'corredores' },
};
export const ONDE_QUADRO = { comodos: 'nos cômodos (lado de dentro)', corredores: 'fora dos cômodos (corredores, salões)', todas: 'em toda parede' };
export function quadroNovo(tipo = 'quadro') { const t = TIPOS_QUADRO[tipo] || TIPOS_QUADRO.quadro;
  return { id: 'q' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), nome: t.nome, tipo, largura: t.largura, altura: t.altura, y: t.y, cls: t.cls, v: t.v, cls2: t.cls2, v2: t.v2, densidade: t.densidade, onde: t.onde, peso: 1, ativo: true }; }
export const quadrosPadrao = () => Object.keys(TIPOS_QUADRO).map((k, i) => ({ ...quadroNovo(k), id: 'qp' + i }));
// as peças de um item, no espaço da face da parede: u ao longo dela (centrado), y para cima, n para fora. [u0,y0,n0,u1,y1,n1,cls,v]
export function pecasQuadro(q, va = 0) {
  const w = q.largura / 2, y0 = q.y - q.altura / 2, y1 = q.y + q.altura / 2, A = q.cls, V = q.v, B = q.cls2, W = q.v2, out = [];
  if (q.tipo === 'poster') { out.push([-w, y0, 0, w, y1, .012, A, V], [-w + .04, y1 - q.altura * .2, .012, w - .04, y1 - .04, .016, B, W], [-w + .06, y0 + q.altura * .22, .012, w - .06, y1 - q.altura * .28, .016, A, V * .55]); }
  else if (q.tipo === 'relogio') { out.push([-w, y0, 0, w, y1, .05, B, W], [-w + .04, y0 + .04, .05, w - .04, y1 - .04, .055, A, V], [-.008, q.y, .055, .008, q.y + w * .7, .062, 'N', .1], [0, q.y - .008, .055, w * .5, q.y + .008, .062, 'N', .1]); }
  else if (q.tipo === 'avisos') { out.push([-w, y0, 0, w, y1, .035, B, W]);
    for (let k = 0; k < 4; k++) { const a = h(va, k, 71), b = h(va, k, 73), pu = -w + .1 + a * (2 * w - .35), pv = y0 + .08 + b * (q.altura - .35); out.push([pu, pv, .035, pu + .22, pv + .28, .04, A, V * (.85 + .15 * h(va, k, 79))]); } }
  else if (q.tipo === 'placa') { out.push([-w, y0, 0, w, y1, .03, A, V], [-w + .05, q.y - q.altura * .15, .03, w - .05, q.y + q.altura * .15, .035, B, W]); }
  else { const f = q.tipo === 'figura' ? .035 : .06; out.push([-w, y0, 0, w, y1, .04, B, W], [-w + f, y0 + f, .04, w - f, y1 - f, .05, A, V]);
    if (q.tipo === 'quadro') { const a = h(va, 1, 81), b = h(va, 2, 83); out.push([-w + f + a * w * .6, y0 + f + b * q.altura * .3, .05, -w + f + a * w * .6 + w * .7, y0 + f + b * q.altura * .3 + q.altura * .35, .055, A, V * .55],
      [w * (a - .5) * .5, y1 - f - q.altura * .3, .05, w * (a - .5) * .5 + w * .5, y1 - f - .05, .055, A, Math.min(1.2, V * 1.35)]); }
    else out.push([-w * .35, y0 + f + .03, .05, w * .35, y0 + q.altura * .62, .055, 'PE', .55]); }
  return out;
}
// os itens nas paredes de um layout: [{p: índice da parede, lado, u, q: índice do item, va}] (a peça se monta com pecasQuadro)
// L: {paredes, portas, instancias, comodos, semente}; estilos: as paredes da biblioteca por id (a de papel "externo" não leva nada)
export function quadrosNaParede(L, quadros, estilos = {}) {
  const ativos = (quadros || []).map((q, i) => [q, i]).filter(([q]) => q.ativo !== false && (q.peso ?? 1) > 0 && (q.densidade ?? 0) > 0); if (!ativos.length) return [];
  const seed = ((L.semente || 1) * 7 + 5) | 0, rects = (L.comodos || []).flatMap(c => c.r || []), portas = L.portas || [], inst = L.instancias || [], out = [];
  const dentro = (x, z) => rects.some(r => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
  (L.paredes || []).forEach((p, n) => {
    if ((p.alt ?? 2.6) < 2 || p.comp < 1.4 || (p.comp === p.esp && p.comp < 1)) return;
    if (estilos[p.e]?.papel === 'externo') return;
    const r = p.rot * Math.PI / 180, dx = Math.cos(r), dz = -Math.sin(r), nx = Math.sin(r), nz = Math.cos(r), S = 1.5, ns = Math.floor((p.comp - .4) / S);
    for (const lado of [1, -1]) for (let k = 0; k < ns; k++) {
      const a = h(n, k * 2 + (lado > 0 ? 1 : 0), seed), b = h(n, k * 2 + (lado > 0 ? 1 : 0), seed + 2);
      const u = -p.comp / 2 + .2 + (k + .5) * S, fx = p.x + dx * u + nx * lado * ((p.esp ?? .2) / 2 + .4), fz = p.z + dz * u + nz * lado * ((p.esp ?? .2) / 2 + .4), dn = dentro(fx, fz);
      const cand = ativos.filter(([q]) => q.onde === 'todas' || (q.onde === 'comodos') === dn); if (!cand.length) continue;
      let t = 0; for (const [q] of cand) t += q.peso ?? 1; let z = b * t, sel = cand[cand.length - 1]; for (const c of cand) { z -= c[0].peso ?? 1; if (z <= 0) { sel = c; break; } }
      const [q, qi] = sel; if (a >= q.densidade || q.y + q.altura / 2 > (p.alt ?? 2.6) - .08) continue;
      const px = p.x + dx * u, pz = p.z + dz * u;
      if (portas.some(d => Math.hypot(d.x - px, d.z - pz) < d.larg / 2 + q.largura / 2 + .25)) continue;
      if (inst.some(s => !s.y && Math.hypot(s.x - fx, s.z - fz) < .75)) continue;
      out.push({ p: n, lado, u, q: qi, va: Math.floor(h(n, k, seed + 4) * 8) });
    }
  });
  return out;
}
// as peças de um item já postas no espaço da parede (o x da parede ao longo dela, z para fora do lado certo)
export function pecasNaParede(it, q, esp) {
  const e = (esp ?? .2) / 2, s = it.lado;
  return pecasQuadro(q, it.va).map(([u0, y0, n0, u1, y1, n1, c, v]) => [it.u + u0, y0, s > 0 ? e + n0 : -e - n1, it.u + u1, y1, s > 0 ? e + n1 : -e - n0, c, v]);
}
