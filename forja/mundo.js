// O mundo de um nível da Forja dentro do Bolha (a engine do index, sem Godot).
// Cada bloco do jogo é um MÓDULO da Forja: gerar(estilo, semente, elementos, opções) — o mesmo layouts.js/pisos.js que
// a bancada da Forja mostra, então o que se vê lá é o que se joga aqui. Este arquivo só responde ao jogo:
//   montar(ci, cj)            a geometria do bloco (chão, paredes, portas, objetos, luminárias, coisas no chão) + colisão
//   bloqueio(x0,z0,x1,z1,sol) o segmento bate em parede alta (visão) ou em parede/objeto sólido (passagem)?
//   arestaAberta(i, j, d)     a aresta entre células de C m deixa passar (o caminho das criaturas)
//   comodoEm(x, z)            o cômodo no ponto (tipo, escuro, piso) ou null fora
//   externo(x, z), luz(...)   a luz assada das luminárias do nível (parede bloqueia), céu fora
// Nada aqui é regra fixa do jogo: os números vêm do nível (nivel.json, da Forja) ou de `D.par` (parâmetros da Forja).
import { gerar, ESTILOS, MODULO } from './layouts.js';
import * as P from './pisos.js';
import { chaveCopia, valorCopia, corCopia, corDominante, recolorir, comVariacaoDoNivel } from './variacao.js';
export { corDominante, recolorir }; // o jogo recolore os .glb com a mesma conta

const rad = (g) => g * Math.PI / 180;

// ------------------------------------------------------------------------------------------------ acumulador de malha
class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; this.b = []; }
  tri(a, b, c, ca, cb, cc, ka, kb, kc) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    this.p.push(...a, ...b, ...c); this.c.push(...ca, ...cb, ...cc); this.b.push(ka, kb, kc); for (let i = 0; i < 3; i++) this.n.push(...n);
  }
  quad(a, b, c, d, ca, cb, cc, cd, k = [0, 0, 0, 0]) { this.tri(a, b, c, ca, cb, cc, k[0], k[1], k[2]); this.tri(a, c, d, ca, cc, cd, k[0], k[2], k[3]); }
  vazio() { return !this.p.length; }
  geo(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('bake', new THREE.Float32BufferAttribute(this.b, 1));
    return g;
  }
}
// a caixa local [a0,y0,b0,a1,y1,b1] posta em (x, z), girada rot graus em y; bake(p, n) dá a luz assada de cada vértice
function caixa(A, q, x, z, rot, col, bake, topo = null) {
  const [a0, y0, b0, a1, y1, b1] = q, r = rad(rot), co = Math.cos(r), si = Math.sin(r), Pt = (a, y, b) => [x + a * co + b * si, y, z - a * si + b * co];
  const v = [Pt(a0, y0, b0), Pt(a1, y0, b0), Pt(a1, y0, b1), Pt(a0, y0, b1), Pt(a0, y1, b0), Pt(a1, y1, b0), Pt(a1, y1, b1), Pt(a0, y1, b1)];
  const face = (i0, i1, i2, i3, nx, ny, nz, c = col) => { const ks = [i0, i1, i2, i3].map(i => bake(v[i], nx, ny, nz)); A.quad(v[i0], v[i1], v[i2], v[i3], c, c, c, c, ks); };
  const N = (a, b) => [a * co + b * si, -a * si + b * co];
  if (topo) { A.quad(v[4], v[7], v[6], v[5], topo, topo, topo, topo, [0, 0, 0, 0]); } else face(4, 7, 6, 5, 0, 1, 0);
  let [nx, nz] = N(0, 1); face(3, 2, 6, 7, nx, 0, nz);
  [nx, nz] = N(0, -1); face(0, 4, 5, 1, nx, 0, nz);
  [nx, nz] = N(1, 0); face(1, 5, 6, 2, nx, 0, nz);
  [nx, nz] = N(-1, 0); face(0, 3, 7, 4, nx, 0, nz);
  A.quad(v[0], v[1], v[2], v[3], col, col, col, col, [0, 0, 0, 0]);
}
// partes de receita (as primitivas do objeto padrão da Forja) num acumulador, em coordenadas do mundo
function receita(A, partes, M, cor, k) {
  const T = (p) => { const x = p[0] * M.s, y = p[1] * M.s, z = p[2] * M.s; return [M.x + x * M.co + z * M.si, M.y + y, M.z - x * M.si + z * M.co]; };
  const K = [k, k, k, k], sh = (c, f) => c.map(x => x * f);
  for (const q of partes || []) {
    const p = q.p || [], c = cor(q.cls, q.v);
    if (q.f === 'caixa' || q.f === 'caixa_girada') {
      const [ox, oz, gr, b] = q.f === 'caixa' ? [0, 0, 0, p] : [p[0], p[1], p[2], p.slice(3)];
      const r = rad(gr), co = Math.cos(r), si = Math.sin(r), L = (a, y, bb) => T([ox + a * co + bb * si, y, oz - a * si + bb * co]);
      const v = [L(b[0], b[1], b[2]), L(b[3], b[1], b[2]), L(b[3], b[1], b[5]), L(b[0], b[1], b[5]), L(b[0], b[4], b[2]), L(b[3], b[4], b[2]), L(b[3], b[4], b[5]), L(b[0], b[4], b[5])];
      const s1 = sh(c, .82), s2 = sh(c, .66);
      A.quad(v[4], v[7], v[6], v[5], c, c, c, c, K); A.quad(v[3], v[2], v[6], v[7], s1, s1, s1, s1, K); A.quad(v[0], v[4], v[5], v[1], s2, s2, s2, s2, K);
      A.quad(v[1], v[5], v[6], v[2], s2, s2, s2, s2, K); A.quad(v[0], v[3], v[7], v[4], s1, s1, s1, s1, K);
    } else if (q.f === 'cilindro' || q.f === 'esfera' || q.f === 'luz') {
      const n = q.f === 'cilindro' ? Math.max(3, q.seg || 6) : 5, cx = p[0], cz = q.f === 'cilindro' ? p[1] : p[2];
      const [r0, r1, y0, y1] = q.f === 'cilindro' ? [p[2], p[5] ?? p[2], p[3], p[4]] : [p[3], p[3], p[1] - p[3] * (q.sy || 1), p[1] + p[3] * (q.sy || 1)], ym = (y0 + y1) / 2;
      const ring = (r, y) => Array.from({ length: n }, (_, i) => T([cx + Math.cos(i / n * 6.283) * r, y, cz + Math.sin(i / n * 6.283) * r]));
      const cc = q.f === 'luz' ? [1.3, 1.25, 1.1] : c, kk = q.f === 'luz' ? [1, 1, 1, 1] : K;
      if (q.f === 'cilindro') { const Ar = ring(r0, y0), B = ring(r1, y1), top = T([cx, y1, cz]); for (let i = 0; i < n; i++) { const j = (i + 1) % n; A.quad(Ar[i], B[i], B[j], Ar[j], sh(cc, .8), cc, cc, sh(cc, .8), kk); A.tri(top, B[j], B[i], cc, cc, cc, k, k, k); } }
      else { const Mr = ring(r0, ym), top = T([cx, y1, cz]), bot = T([cx, y0, cz]); for (let i = 0; i < n; i++) { const j = (i + 1) % n; A.tri(top, Mr[j], Mr[i], cc, cc, cc, kk[0], kk[0], kk[0]); A.tri(bot, Mr[i], Mr[j], sh(cc, .7), sh(cc, .7), sh(cc, .7), kk[0], kk[0], kk[0]); } }
    } else if (q.f === 'tubo' || q.f === 'viga') {
      const a = p.slice(0, 3), b = p.slice(3, 6), t = (p[6] || .05) / 2, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Ln = Math.hypot(...d); if (Ln < 1e-4) continue;
      const u = Math.abs(d[1]) / Ln > .9 ? [1, 0, 0] : [0, 1, 0], x = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]], lx = Math.hypot(...x), X = x.map(v => v / lx * t);
      const y = [d[1] * X[2] - d[2] * X[1], d[2] * X[0] - d[0] * X[2], d[0] * X[1] - d[1] * X[0]], ly = Math.hypot(...y), Y = y.map(v => v / ly * t);
      const n = q.f === 'tubo' ? Math.max(4, q.seg || 6) : 4, S = Array.from({ length: n }, (_, i) => { const g = (i + (q.f === 'viga' ? .5 : 0)) / n * 6.283; return [Math.cos(g) * 1.414 ** (q.f === 'viga'), Math.sin(g) * 1.414 ** (q.f === 'viga')]; });
      const cn = (P0, s1, s2) => T([P0[0] + X[0] * s1 + Y[0] * s2, P0[1] + X[1] * s1 + Y[1] * s2, P0[2] + X[2] * s1 + Y[2] * s2]);
      for (let i = 0; i < n; i++) { const [a1, b1] = S[i], [a2, b2] = S[(i + 1) % n]; A.quad(cn(a, a1, b1), cn(b, a1, b1), cn(b, a2, b2), cn(a, a2, b2), c, c, c, c, K); }
    }
  }
}

// uma receita sozinha, na origem (o colecionável que as memórias dão): position, normal, color e bake = 1
export function malhaDaReceita(THREE, partes, hue) {
  const A = new Acc(), cor = (cls, v) => { const h = hue(cls) || hue('CL'); const k = v ?? 1; return [h.r * k, h.g * k, h.b * k]; };
  receita(A, partes, { x: 0, y: 0, z: 0, s: 1, co: 1, si: 0 }, cor, 1);
  return A.vazio() ? null : A.geo(THREE);
}

// ------------------------------------------------------------------------------------------------ o mundo
// N = nivel.json; D = { THREE, hue(cls) → THREE.Color, fbm, h3, semente, par(grupo, chave, padrão), L (a definição do nível), modelos: {eid: THREE.Object3D} }
export function criarMundo(N, D) {
  const { THREE } = D, R = N.receita || {}, els = R.els || [], porId = N.elementos || {}, vis = N.visual || {};
  const C = 3, H = +D.L.H || 2.6, PASSAGEM = D.par('forja', 'passagem_modulo', 1.6);
  const cor = (cls, v) => { const h = D.hue(cls) || D.hue('CL'); return [h.r * v, h.g * v, h.b * v]; };
  // o modo de cor do nível (Regulagem → Degradê): a variação de cor das cópias vira de luminância (corCopia)
  const DEGRADE = D.degrade ?? (N.cor?.reg?.modo === 1 || N.cor?.reg?.modo === 'degrade');
  const o = { largura: R.largura || 24, profundidade: R.profundidade || 24, densidade: R.densidade ?? 1, mistura: R.mistura, liberados: R.liberados, ambiente: R.ambiente,
              funcoes: R.funcoes, tema: R.tema, kits: R.kits, visual: vis };
  const ks = (R.estilos || []).filter(k => k === 'mistura' || ESTILOS[k]), fixos = N.fixos || [], nsem = R.sementes || 12;
  if (!ks.length && !fixos.length) ks.push('amplo');
  // o tamanho do bloco: o maior chão que algum estilo dá (os de grade arredondam), em células de 3 m
  let S = 6;
  for (const k of ks) { if (k === 'mistura') { S = Math.max(S, Math.round(o.largura / MODULO) * MODULO, Math.round(o.profundidade / MODULO) * MODULO); continue; }
    try { const L = gerar(k, 1, [], { largura: o.largura, profundidade: o.profundidade, inspecionar: false }); S = Math.max(S, L.largura, L.profundidade); } catch { S = Math.max(S, o.largura, o.profundidade); } }
  for (const f of fixos) S = Math.max(S, f.largura || 0, f.profundidade || 0);
  S = Math.ceil(S / C) * C;
  const aberto = !!N.aberto, base = (D.semente >>> 0) || 1;
  const mods = new Map(), key = (ci, cj) => ci + ',' + cj;
  const dark = D.L.escuro ?? .7, quebr = D.L.quebradas ?? .07, pisca = D.L.pisca ?? .12, passoLuz = D.par('forja', 'passo_luminaria', 6);
  const LUM = { forca: D.par('luminaria', 'forca', 1.05), queda: D.par('luminaria', 'queda', 2.6), alcance: D.par('luminaria', 'alcance', 7.5), limite: D.par('luminaria', 'luz_limite', 1.2) };
  const AMB = D.par('forja', 'ambiente_dentro', .05), CEU = D.L.ceu || D.par('forja', 'ceu', .16);

  function rngDe(ci, cj, k) { let a = (Math.floor(D.h3(ci, cj, 4100 + k) * 4294967295) ^ base) >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const injetados = new Map(); // layouts que o worker já gerou (o jogo não gera de novo)
  function layoutDe(ci, cj) {
    const kj = key(ci, cj); if (injetados.has(kj)) { const L = injetados.get(kj); injetados.delete(kj); return L; }
    const r = rngDe(ci, cj, 1), n = Math.floor(r() * (ks.length * nsem + fixos.length));
    if (n >= ks.length * nsem) { const f = fixos[n - ks.length * nsem]; return f.chao || !vis.pisos?.length ? f : P.enfeitar(f, vis, o.funcoes || []); }
    const k = ks[Math.floor(n / nsem)], sem = 1 + Math.floor(r() * 999999);
    try { return gerar(k, sem, els, o); } catch (e) { console.warn('forja: módulo', k, e); return gerar('amplo', sem, els, o); }
  }

  // o módulo em coordenadas do mundo, com o que as consultas precisam
  function modulo(ci, cj) {
    const kk = key(ci, cj); let M = mods.get(kk); if (M) return M;
    const L = layoutDe(ci, cj), cx = (ci + .5) * S, cz = (cj + .5) * S, w = L.largura, d = L.profundidade;
    const paredes = [], portas = (L.portas || []).map(p => ({ ...p, x: p.x + cx, z: p.z + cz }));
    for (const p of L.paredes || []) for (const s of cortar(p, w, d, portas, cx, cz)) { const a = rad(s.rot); paredes.push({ ...s, x: s.x + cx, z: s.z + cz, co: Math.cos(a), si: Math.sin(a) }); }
    const objs = [], caixas = [];
    for (const s of L.instancias || []) { const e = porId[s.elemento]; if (!e) continue;
      const ob = { ...s, x: s.x + cx, z: s.z + cz, lx: s.x, lz: s.z, e }; objs.push(ob);
      if (e.colide !== false && !s.y) { const a = rad(s.rot), c = Math.abs(Math.cos(a)), si = Math.abs(Math.sin(a)), k = (s.escala || 1) * .45;
        const hx = (c * e.w + si * e.d) * k, hz = (si * e.w + c * e.d) * k; if (hx > .05 && hz > .05) caixas.push([ob.x - hx, ob.z - hz, ob.x + hx, ob.z + hz]); } }
    let cms = []; try { cms = P.comodos(L); } catch { /* sem cômodos */ }
    const rp = rngDe(ci, cj, 2), pisoId = Object.fromEntries((vis.pisos || []).map(x => [x.id, x]));
    const comodos = cms.map((cm, n) => {
      const rs = cm.r.map(q => [q[0] + cx, q[1] + cz, q[2] + cx, q[3] + cz]), b = rs.reduce((m, q) => [Math.min(m[0], q[0]), Math.min(m[1], q[1]), Math.max(m[2], q[2]), Math.max(m[3], q[3])], [1e9, 1e9, -1e9, -1e9]);
      const gx = (b[0] + b[2]) / 2, gz = (b[1] + b[3]) / 2, inicio = ci === 0 && cj === 0 && rs.some(q => L.inicio[0] + cx >= q[0] && L.inicio[0] + cx <= q[2] && L.inicio[1] + cz >= q[1] && L.inicio[1] + cz <= q[3]);
      const escuro = !inicio && (D.fbm(gx * .02 + 91, gz * .02 + 7, 3, 2) > dark || rp() < D.par('luz', 'sala_escura', .07));
      const piso = pisoId[cm.p]; const tipo = cm.funcao || (cm.a < 12 ? 'corredor' : 'vazio');
      return { forja: true, id: kk + ':' + n, r: rs, b, area: cm.a, type: tipo, dark: escuro, piso: superficieDe(piso), pisoId: cm.p, funcao: cm.funcao || '', inicio, x0: Math.floor(b[0] / C), y0: Math.floor(b[1] / C), w: Math.max(1, Math.round((b[2] - b[0]) / C)), h: Math.max(1, Math.round((b[3] - b[1]) / C)) };
    });
    // o espaço de dentro que não é cômodo (o galpão, a garagem): um "salão" do módulo
    const salao = aberto ? null : { forja: true, id: kk + ':salao', r: [[cx - S / 2, cz - S / 2, cx + S / 2, cz + S / 2]], b: [cx - S / 2, cz - S / 2, cx + S / 2, cz + S / 2], type: 'salao', area: S * S,
      dark: !(ci === 0 && cj === 0) && D.fbm(cx * .02 + 91, cz * .02 + 7, 3, 2) > dark, piso: superficieDe(pisoId[(L.chao || [])[0]?.p]), x0: Math.floor((cx - S / 2) / C), y0: Math.floor((cz - S / 2) / C), w: S / C, h: S / C };
    const ext = (L.chao || []).filter(g => { const s = pisoId[g.p]; return s && (s.papel === 'externo' || s.papel === 'via'); }).map(g => [g.x0 + cx, g.z0 + cz, g.x1 + cx, g.z1 + cz]);
    M = { ci, cj, L, cx, cz, x0: cx - S / 2, z0: cz - S / 2, x1: cx + S / 2, z1: cz + S / 2, paredes, portas, objs, caixas, comodos, salao, ext, lamps: null };
    M.lamps = luminarias(M, rngDe(ci, cj, 3));
    mods.set(kk, M); if (mods.size > 80) mods.delete(mods.keys().next().value);
    return M;
  }
  // a parede na borda do módulo ganha uma passagem para o vizinho (os módulos são infinitos: sempre há vizinho)
  function cortar(p, w, d, portas, cx, cz) {
    const r = ((Math.round(p.rot) % 180) + 180) % 180; let lado = -1;
    if (r === 90 && Math.abs(Math.abs(p.x) - w / 2) < .3) lado = 0; else if (r === 0 && Math.abs(Math.abs(p.z) - d / 2) < .3) lado = 1;
    if (lado < 0) return [p];
    const c = r === 90 ? -p.z : p.x, a0 = c - p.comp / 2, a1 = c + p.comp / 2;
    if (a0 > -PASSAGEM / 2 || a1 < PASSAGEM / 2) return [p];
    portas.push({ x: (r === 90 ? p.x : 0) + cx, z: (r === 90 ? 0 : p.z) + cz, rot: r, larg: PASSAGEM, alt: p.alt, esp: p.esp });
    const out = [];
    for (const [s0, s1] of [[a0, -PASSAGEM / 2], [PASSAGEM / 2, a1]]) { if (s1 - s0 < .25) continue; const m = (s0 + s1) / 2;
      out.push({ ...p, x: r === 90 ? p.x : m, z: r === 90 ? -m : p.z, comp: s1 - s0 }); }
    return out;
  }
  function superficieDe(s) { if (!s) return D.L.pisoDuro || 'concreto'; const t = `${s.nome || ''} ${s.padrao || ''}`.toLowerCase();
    return /carpete|tapete|assoalho|madeira/.test(t) ? 'carpete' : /grama|relva|terra|areia|lama|organico|cascalho/.test(t) ? 'terra' : /ladrilho|azulejo/.test(t) ? 'ladrilho' : 'concreto'; }

  // luminárias: grade espaçada dentro de cada cômodo aceso (e no salão de um nível fechado), como fixtureAt do index
  // ---------------------------------------------------------------------------------------------- TETO (= ForjaNivel.gd)
  // O teto da Godot, portado: a luminária de cada cômodo sai de um critério — a FAMÍLIA (pelo piso do cômodo; o principal
  // segue o cenário do nível) × o FORMATO (corredor, pequeno, médio, grande, salão), um tipo por combinação no nível —, a luz
  // do ambiente (receita.funcoes[].luz: tipo, distribuição, densidade, estado, força) muda por cima; as posições são as do
  // _posicoes e o desenho o do _luminaria. Os números vêm da Forja (D.teto = forja/teto.py valendo(): padrão + teto.json).
  const TT = D.teto && D.teto.tipos ? D.teto : null;
  const pisoIdT = Object.fromEntries((vis.pisos || []).map(x => [x.id, x]));
  const luzFuncao = Object.fromEntries((R.funcoes || []).filter(f => f && f.luz).map(f => [f.id, f.luz]));
  const nhT = (base % 997) + 1;
  const famNivel = (() => {
    if (!TT) return 'servico';
    const cen = N.cenario, t = `${N.nome || ''} ${typeof cen === 'string' ? cen : `${cen?.nome || ''} ${cen?.leitura || ''}`}`.toLowerCase();
    let melhor = '', pontos = 0;
    for (const [fam, ks] of Object.entries(TT.fam_cenario || {})) { let n = 0; for (const k of ks) n += t.split(k).length - 1; if (n > pontos) { pontos = n; melhor = fam; } }
    if (melhor) return melhor;
    const ps = vis.pisos || []; return ps.length ? (TT.fam_piso[ps[0].padrao] || 'servico') : 'servico';
  })();
  const maiorRet = (rs) => rs.reduce((m, q) => ((q[2] - q[0]) * (q[3] - q[1]) > (m[2] - m[0]) * (m[3] - m[1]) ? q : m), rs[0]);
  function criterioTeto(rm) {
    let fam = famNivel; const ps = pisoIdT[rm.pisoId];
    if (ps && ps.papel !== 'principal') fam = TT.fam_piso[ps.padrao] || famNivel;
    const m = maiorRet(rm.r), cur = Math.min(m[2] - m[0], m[3] - m[1]), lon = Math.max(m[2] - m[0], m[3] - m[1]), a = rm.area;
    return [fam, cur <= 3.2 && lon >= cur * 2 ? 'corredor' : a < 10 ? 'pequeno' : a < 40 ? 'medio' : a < 90 ? 'grande' : 'salao'];
  }
  const tipoCrit = (fam, fmt) => { const op = TT.criterio[fam]?.[fmt] || ['tubo']; return op[Math.min(op.length - 1, Math.floor(D.h3(TT.familias.indexOf(fam), TT.formatos.indexOf(fmt), nhT) * op.length))]; };
  // onde ficam as luminárias de um retângulo [x0,z0,x1,z1]: [x, z, ângulo, comprimento?] (= _posicoes)
  function posicoesTeto(tipo, r, passo, dist) {
    const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2, sx = r[2] - r[0], sz = r[3] - r[1], deitado = sx >= sz, ang = deitado ? 0 : Math.PI / 2;
    const lon = Math.max(sx, sz), cur = Math.min(sx, sz), out = [];
    if (tipo === 'emergencia') return [[cx, cz, ang]];
    if (tipo === 'sanca') { const a = [r[0] + .35, r[1] + .35, r[2] - .35, r[3] - .35];
      if (a[2] - a[0] > .5 && a[3] - a[1] > .5) out.push([cx, a[1], 0, a[2] - a[0]], [cx, a[3], 0, a[2] - a[0]], [a[0], cz, Math.PI / 2, a[3] - a[1]], [a[2], cz, Math.PI / 2, a[3] - a[1]]);
      out.push([cx, cz, ang]); return out; }
    if (tipo === 'varal') { const nf = Math.max(1, Math.round(cur / passo)); for (let k = 0; k < nf; k++) { const off = -cur / 2 + (k + .5) * cur / nf; out.push([cx + (deitado ? 0 : off), cz + (deitado ? off : 0), ang, Math.max(1, lon - .8)]); } return out; }
    const fileira = () => { const nl = Math.max(1, Math.round(lon / passo)); for (let k = 0; k < nl; k++) { const off = -lon / 2 + (k + .5) * lon / nl; out.push([cx + (deitado ? off : 0), cz + (deitado ? 0 : off), ang]); } return out; };
    if (tipo === 'lustre') return fileira();
    if (dist === 'centro') return [[cx, cz, ang]];
    if (dist === 'canto') return [[r[0] + Math.min(1, sx / 3), r[1] + Math.min(1, sz / 3), ang]];
    if (dist === 'linha' || (dist === 'perimetro' && cur < 4.5)) return fileira();
    if (dist === 'perimetro') { const a = [r[0] + 1, r[1] + 1, r[2] - 1, r[3] - 1], na = Math.max(1, Math.round((a[2] - a[0]) / passo)), nb = Math.max(1, Math.round((a[3] - a[1]) / passo));
      for (let k = 0; k <= na; k++) { const x = a[0] + k * (a[2] - a[0]) / na; out.push([x, a[1], 0], [x, a[3], 0]); }
      for (let k = 1; k < nb; k++) { const z = a[1] + k * (a[3] - a[1]) / nb; out.push([a[0], z, Math.PI / 2], [a[2], z, Math.PI / 2]); } return out; }
    let nx = Math.max(1, Math.round(sx / passo)), nz = Math.max(1, Math.round(sz / passo));
    if (cur <= 3.2) { if (deitado) nz = 1; else nx = 1; }
    const xadrez = dist === 'esparsa' && nx * nz > 1;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { if (xadrez && (i + j) % 2 === 1) continue; out.push([r[0] + (i + .5) * sx / nx, r[1] + (j + .5) * sz / nz, ang]); }
    return out;
  }
  // um ponto de luz (ou vários fracos ao longo das compridas: varal, fita da sanca), com a força, a queda e o alcance do tipo
  function pontosLuz(f, spec, forca) {
    if (!(f.len > 0)) return [{ x: f.x, y: f.y, z: f.z, forca: spec.forca * forca, queda: spec.queda, alcance: spec.alcance }];
    const cnt = Math.max(1, Math.round(f.len / 1.6)), dx = Math.cos(f.ang), dz = -Math.sin(f.ang), out = [];
    for (let k = 0; k < cnt; k++) { const t = (k + .5) / cnt - .5; out.push({ x: f.x + dx * t * f.len, y: f.y, z: f.z + dz * t * f.len, forca: spec.forca * forca, queda: spec.queda, alcance: spec.alcance }); }
    return out;
  }
  // VENTILADORES de um cômodo (= _vent_comodo): família × formato dão a chance e os tipos; no eixo comprido, um a cada passo
  // (até max_comodo), longe da parede e das luminárias (desvia para o lado; com a lâmpada embutida toma o lugar da luminária
  // que bateria); pás acima de altura_min (a haste encurta; não cabe = sem). Gira só com energia: dos com energia, `ligados`
  // estão ligados e `quebrados` parados. Devolve os índices do plano que saíram; põe o ventilador em M.vents.
  function ventComodo(M, n, rm, m, semLuz, plano, luzRef, out) {
    const tira = new Set(), [fam, fmt] = criterioTeto(rm), vc = TT.criterio_vent[fam] || {}, chance = +(vc.chance || {})[fmt] || 0;
    const tipos = (vc.tipos || []).filter(x => TT.ventiladores[x]);
    if (chance <= 0 || !tipos.length || D.h3(M.ci * 71 + n, M.cj * 13 + n, 57 + nhT) >= chance) return tira;
    const t = tipos[Math.min(tipos.length - 1, Math.floor(D.h3(M.ci * 5 + n, M.cj * 3, 61 + nhT) * tipos.length))], p = TT.ventiladores[t], rg = TT.vent;
    const esc = +rg.escala || 1, R = (+p.raio || .6) * esc, motor = (+p.motor || .12) * esc, sx = m[2] - m[0], sz = m[3] - m[1], cur = Math.min(sx, sz), lon = Math.max(sx, sz), parede = +rg.parede || .3;
    if (cur < 2 * (R + parede)) return tira;
    const amin = +rg.altura_min || 2.1; let haste = +p.haste || .3;
    if (H - haste - motor < amin) { haste = H - motor - amin; if (haste < .04) return tira; }
    const folga = R + (+rg.folga || .35) + .35, deitado = sx >= sz, al = deitado ? [1, 0] : [0, 1], dl = deitado ? [0, 1] : [1, 0];
    const nv = Math.min(Math.max(1, Math.round(lon / Math.max(1, +rg.passo || 5.5))), Math.max(1, +rg.max_comodo || 3));
    const den = [m[0] + R + parede, m[1] + R + parede, m[2] - R - parede, m[3] - R - parede], comLuz = !semLuz;
    const ligado = !semLuz && D.h3(M.ci * 29 + n, M.cj * 7, 63 + nhT) < (+rg.ligados ?? .65), postos = [], cx = (m[0] + m[2]) / 2, cz = (m[1] + m[3]) / 2;
    M.vents = M.vents || [];
    for (let k = 0; k < nv; k++) {
      const off = -lon / 2 + (k + .5) * lon / nv, c = [cx + al[0] * off, cz + al[1] * off]; let pos = null;
      for (const d of [[0, 0], al, [-al[0], -al[1]], dl, [-dl[0], -dl[1]], [al[0] + dl[0], al[1] + dl[1]], [-al[0] - dl[0], -al[1] - dl[1]]]) {
        const cand = [c[0] + d[0] * folga, c[1] + d[1] * folga];
        if (cand[0] < den[0] || cand[0] > den[2] || cand[1] < den[1] || cand[1] > den[3]) continue;
        if (postos.some(pv => Math.hypot(pv[0] - cand[0], pv[1] - cand[1]) < 2 * R + .3)) continue;
        const bate = []; plano.forEach((q, i) => { if (!tira.has(i) && Math.hypot(q[0] - cand[0], q[1] - cand[1]) < folga) bate.push(i); });
        if (!bate.length || comLuz) { bate.forEach(i => tira.add(i)); pos = cand; break; }
      }
      if (!pos) continue;
      postos.push(pos);
      let tirou = 0; for (const i of tira) if (Math.hypot(plano[i][0] - pos[0], plano[i][1] - pos[1]) < folga) tirou++;
      const quebrado = D.h3(Math.round(pos[0] * 4), Math.round(pos[1] * 4), 65 + nhT) < (+rg.quebrados ?? .12), hr = D.h3(Math.round(pos[0] * 4) + 3, Math.round(pos[1] * 4), 67 + nhT);
      const rpm = ligado && !quebrado ? lerp(+rg.rpm_min || 45, +rg.rpm_max || 120, hr) : 0;
      M.vents.push({ x: pos[0], z: pos[1], teto: H, haste, t, rpm, esc, ang: hr * Math.PI * 2, luz: comLuz });
      if (comLuz) { let lf = +p.luz_forca || .7, lq = 2, la = 5.5; if (luzRef) { lf = Math.max(lf, luzRef[0] * Math.sqrt(Math.max(1, tirou))); lq = Math.max(lq, luzRef[1]); la = Math.max(la, luzRef[2]); }
        out.push({ x: pos[0], z: pos[1], y: H - haste - motor - .15, t: 'ventilador', s: 1, semDesenho: true, pts: [{ x: pos[0], y: H - haste - motor - .15, z: pos[1], forca: lf, queda: lq, alcance: la }] }); }
    }
    return tira;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  // as luminárias de um módulo pelo critério da Godot (_luz_modulo + _luz_salao)
  function luminariasTeto(M) {
    M.vents = [];
    const out = [], hT = (a, b, c) => D.h3(Math.round(a), Math.round(b), c);
    const estado = (corredor, est, x, z, inicio, tipo) => {
      let qb = corredor ? .04 : quebr, pc = corredor ? .08 : pisca;
      if (est === 'piscando') pc = .45; else if (est === 'falhando') { qb = .3; pc = .18; } else if (est === 'meia') qb = .5;
      const hr = hT(x * 4, z * 4, 6 + nhT); return inicio || tipo === 'emergencia' ? 1 : hr < qb ? 0 : hr < qb + pc ? 2 : 1; };
    M.comodos.forEach((rm, n) => {
      if (!rm.r.length) return;
      let tipo = tipoCrit(...criterioTeto(rm));
      const lz = luzFuncao[rm.funcao] || {}, est = lz.estado || '', dist = lz.dist || 'grade', forca = { fraca: .55, forte: 1.35 }[lz.forca] ?? 1, dens = Math.max(.3, +lz.dens || 1);
      if (TT.tipos[lz.t]) tipo = lz.t;
      let escura = rm.dark || (est === 'escura' && !rm.inicio);
      if (est === 'emergencia' && !rm.inicio) { escura = false; tipo = 'emergencia'; }
      const m = maiorRet(rm.r), semLuz = !rm.inicio && escura;
      if (semLuz) ventComodo(M, n, rm, m, true, [[(m[0] + m[2]) / 2, (m[1] + m[3]) / 2]], null, out); // sem energia: o ventilador fica parado
      if (escura && !rm.inicio) { if (est === 'escura') return; if (hT(M.ci, M.cj * 17 + n, 43) < .5) tipo = 'emergencia'; else return; }
      const spec = TT.tipos[tipo]; if (!spec) return;
      const ly = H - spec.desce, corredor = Math.min(m[2] - m[0], m[3] - m[1]) <= 3.2, plano = [];
      for (const r of rm.r) {
        if (r !== m && (Math.min(r[2] - r[0], r[3] - r[1]) < 1.5 || (r[2] - r[0]) * (r[3] - r[1]) < 4)) continue;
        if ((tipo === 'emergencia' || dist === 'centro' || dist === 'canto') && r !== m) continue;
        plano.push(...posicoesTeto(tipo, r, Math.max(.5, spec.passo || 4) / dens, dist));
      }
      // o ventilador com lâmpada toma o lugar da luminária que bateria e acende com a força dela
      const tira = semLuz ? new Set() : ventComodo(M, n, rm, m, false, plano, [spec.forca * forca, spec.queda, spec.alcance], out);
      plano.forEach((p, i) => { if (tira.has(i)) return;
        const f = { x: p[0], z: p[1], y: ly, t: tipo, ang: p[2], len: p[3] || 0, ph: hT(p[0] * 4, p[1] * 4, 7) * 100, rm: rm.id, round: TT.redondas.includes(TT.forma[tipo]?.modelo || tipo) };
        f.s = estado(corredor, est, f.x, f.z, rm.inicio, tipo); if (f.s === 1) f.pts = pontosLuz(f, spec, forca); out.push(f); });
    });
    // o salão (o vão coberto que não é cômodo): o tipo do salão da família do nível, numa grade longe das paredes e dos cômodos
    const sl = M.salao; if (sl && !aberto) {
      let tipo = tipoCrit(famNivel, 'salao'); if (['sanca', 'varal', 'lustre'].includes(tipo)) tipo = famNivel === 'casa' ? 'pendente' : 'campanula';
      const spec = TT.tipos[tipo], passo = Math.max(4.5, spec.passo), ly = H - spec.desce, [x0, z0, x1, z1] = sl.b, ni = Math.max(1, Math.round((x1 - x0) / passo)), nj = Math.max(1, Math.round((z1 - z0) / passo));
      const dentro = (rs, x, z, mg) => rs.some(q => x >= q[0] - mg && x <= q[2] + mg && z >= q[1] - mg && z <= q[3] + mg);
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const x = x0 + (i + .5) * (x1 - x0) / ni, z = z0 + (j + .5) * (z1 - z0) / nj;
        if (M.comodos.some(c => dentro(c.r, x, z, 1)) || M.ext.some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3])) continue;
        if (M.paredes.some(w => { const ax = x - w.x, az = z - w.z; return Math.abs(ax * w.co - az * w.si) < w.comp / 2 + 1 && Math.abs(ax * w.si + az * w.co) < (w.esp ?? .2) / 2 + 1; })) continue; // colada na parede não
        const inicio = M.ci === 0 && M.cj === 0 && Math.hypot(x - (M.L.inicio[0] + M.cx), z - (M.L.inicio[1] + M.cz)) < passo;
        if (!inicio && D.fbm(x * .045 + 91, z * .045 + 7, 3, 2) > dark) continue; // zonas escuras largas, nunca em cima do início
        const f = { x, z, y: ly, t: tipo, ang: x1 - x0 >= z1 - z0 ? 0 : Math.PI / 2, len: 0, ph: hT(x * 4, z * 4, 7) * 100, rm: sl.id, round: TT.redondas.includes(TT.forma[tipo]?.modelo || tipo) };
        const hr = hT(x * 4, z * 4, 6 + nhT); f.s = inicio ? 1 : hr < quebr ? 0 : hr < quebr + pisca ? 2 : 1; if (f.s === 1) f.pts = pontosLuz(f, spec, 1); out.push(f);
      }
    }
    return out;
  }
  // o desenho de uma luminária (= _luminaria): as partes acesas vão para `lit` (geometrias; cinza se queimada), o corpo para o
  // acumulador do mundo com a luz assada; devolve o halo (ou null) — as que piscam ficam soltas com o halo delas
  function desenhaLuminaria(f, A, bake) {
    const t = f.t, spec = TT.tipos[t], fo = TT.forma[t] || {}, mod = TT.modelos.includes(t);
    const md = mod ? (fo.modelo || t) : t, kx = mod ? fo.comp ?? 1 : 1, kz = mod ? fo.larg ?? 1 : 1, ky = mod ? fo.alt ?? 1 : 1;
    let s = ['varal', 'sanca', 'emergencia'].includes(t) ? 1 : spec.escala ?? 1;
    const { x, z, y } = f, ang = f.ang || 0, lit = [], esc = .3;
    const xf = (g) => g.scale(s * kx, 1, s * kz).rotateY(ang).translate(x, 0, z);           // box_xf: escala no plano, gira, põe no lugar
    const sm = s * (kx + kz) / 2;                                                              // as peças redondas crescem pela média
    const caixaXf = (a0, y0, b0, a1, y1, b1) => xf(new THREE.BoxGeometry(a1 - a0, y1 - y0, b1 - b0).translate((a0 + a1) / 2, (y0 + y1) / 2, (b0 + b1) / 2));
    const cil = (px, pz, r, y0, y1, seg, rt = -1) => new THREE.CylinderGeometry(rt < 0 ? r : rt, r, Math.max(.005, y1 - y0), seg).translate(px, (y0 + y1) / 2, pz); // rt = raio de cima
    const haste = (a, b, tk) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L2 = d.length() || 1e-3, g = new THREE.BoxGeometry(tk, L2, tk).translate(0, L2 / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); return g.translate(...a); };
    const corpo = (g, cls, v) => { geoAcc(A, g, cor(cls, v), bake); };
    let hw = 1.2, hd = 1.2;
    switch (md) {
      case 'tubo': lit.push(caixaXf(-.6, H - .13 * ky, -.17, .6, H - .07 * ky, .17)); hw = 1.6; hd = .9; break;
      case 'calha': corpo(caixaXf(-.7, H - .09 * ky, -.28, .7, H - .02 * ky, .28), 'CL', .45); lit.push(caixaXf(-.64, H - .13 * ky, -.2, .64, H - .09 * ky, -.06), caixaXf(-.64, H - .13 * ky, .06, .64, H - .09 * ky, .2)); hw = 1.8; hd = 1.1; break;
      case 'painel': corpo(caixaXf(-.34, H - .05 * ky, -.34, .34, H, .34), 'CL', .5); lit.push(caixaXf(-.29, H - .08 * ky, -.29, .29, H - .05 * ky, .29)); hw = 1; hd = 1; break;
      case 'plafon': corpo(cil(x, z, .34 * sm, H - .05 * ky, H, 10), 'CL', .5); lit.push(cil(x, z, .29 * sm, H - .1 * ky, H - .05 * ky, 10)); hw = 1; hd = 1; break;
      case 'redonda': lit.push(cil(x, z, .6 * sm, H - .13 * ky, H - .07 * ky, 12)); hw = 1.3; hd = 1.3; break;
      case 'pendente': corpo(haste([x, H, z], [x, y + .26 * ky, z], .015), 'AZ', esc); corpo(cil(x, z, .34 * sm, y, y + .26 * ky, 10, .07 * sm), 'CL', .55); lit.push(cil(x, z, .27 * sm, y - .02 * ky, y + .01 * ky, 10)); hw = .9; hd = .9; break;
      case 'lustre': corpo(haste([x, H, z], [x, y + .12 * ky, z], .02), 'AZ', esc); corpo(cil(x, z, .07 * sm, y - .12 * ky, y + .12 * ky, 8, .04 * sm), 'AC', .5);
        for (let k = 0; k < 6; k++) { const a = Math.PI * 2 * k / 6, e = [x + Math.cos(a) * .5 * sm, y + .02 * ky, z + Math.sin(a) * .5 * sm];
          corpo(haste([x, y - .04 * ky, z], e, .02), 'AC', .5); lit.push(cil(e[0], e[2], .055 * sm, y + .02 * ky, y + .15 * ky, 6, .035 * sm)); }
        hw = 1.7; hd = 1.7; break;
      case 'nua': corpo(haste([x, H, z], [x, y + .08 * ky, z], .012), 'AZ', esc); lit.push(cil(x, z, .075 * sm, y - .07 * ky, y + .08 * ky, 6, .035 * sm)); hw = .8; hd = .8; break;
      case 'gaiola': corpo(haste([x, H, z], [x, y + .14 * ky, z], .015), 'AZ', esc); corpo(cil(x, z, .15 * sm, y + .1 * ky, y + .15 * ky, 8), 'CL', .5); lit.push(cil(x, z, .075 * sm, y - .08 * ky, y + .1 * ky, 6, .045 * sm));
        for (let k = 0; k < 4; k++) { const a = Math.PI * 2 * k / 4 + .4; corpo(haste([x + Math.cos(a) * .13 * sm, y + .11 * ky, z + Math.sin(a) * .13 * sm], [x + Math.cos(a) * .1 * sm, y - .12 * ky, z + Math.sin(a) * .1 * sm], .012), 'AZ', .3); }
        hw = .9; hd = .9; break;
      case 'campanula': corpo(haste([x, H, z], [x, y + .36 * ky, z], .02), 'AZ', esc); corpo(cil(x, z, .52 * sm, y, y + .36 * ky, 12, .13 * sm), 'CL', .5); lit.push(cil(x, z, .42 * sm, y - .02 * ky, y + .01 * ky, 12)); hw = 2; hd = 2; break;
      case 'trilho': corpo(caixaXf(-1.1, H - .05 * ky, -.035, 1.1, H, .035), 'AZ', .18);
        for (const u of [-.8, 0, .8]) { const px = x + u * s * kx * Math.cos(ang), pz = z - u * s * kx * Math.sin(ang);
          corpo(cil(px, pz, .075 * sm, H - .2 * ky, H - .05 * ky, 8, .05 * sm), 'AZ', .25); lit.push(cil(px, pz, .06 * sm, H - .22 * ky, H - .2 * ky, 8)); }
        hw = 1.5; hd = .8; break;
      case 'spot': corpo(cil(x, z, .11 * sm, H - .02 * ky, H, 8), 'CL', .4); lit.push(cil(x, z, .075 * sm, H - .04 * ky, H - .02 * ky, 8)); hw = .55; hd = .55; break;
      case 'globo': corpo(haste([x, H, z], [x, y + .18 * ky, z], .018), 'AZ', esc); lit.push(cil(x, z, .12 * sm, y - .2 * ky, y, 10, .22 * sm), cil(x, z, .22 * sm, y, y + .18 * ky, 10, .09 * sm)); hw = 1; hd = 1; break;
      case 'varal': { const ln = f.len; corpo(caixaXf(-ln / 2, y + .04 * ky, -.008, ln / 2, y + .055 * ky, .008), 'AZ', .15);
        const nb = Math.max(2, Math.round(ln / .75));
        for (let k = 0; k < nb; k++) { const u = -ln / 2 + (k + .5) * ln / nb, px = x + u * Math.cos(ang), pz = z - u * Math.sin(ang), g = cil(px, pz, .045 * sm, y - .06 * ky, y + .04 * ky, 6, .025 * sm);
          if (f.s === 1 && D.h3(Math.round(px * 8), Math.round(pz * 8), 9) <= .12) f.mortasExtra = (f.mortasExtra || []).concat([g]); else lit.push(g); } // lâmpadas queimadas no varal
        hw = ln / 2; hd = .5; break; }
      case 'sanca': { const ln2 = f.len;
        if (!(ln2 > 0)) { lit.push(cil(x, z, .2 * sm, H - .06 * ky, H - .02 * ky, 10)); hw = .7; hd = .7; }
        else { corpo(caixaXf(-ln2 / 2, H - .12 * ky, -.12, ln2 / 2, H - .08 * ky, .12), 'CL', .55); lit.push(caixaXf(-ln2 / 2, H - .08 * ky, -.04, ln2 / 2, H - .05 * ky, .04)); hw = ln2 / 2; hd = .45; }
        break; }
      case 'emergencia': corpo(caixaXf(-.2, y, -.06, .2, y + .16 * ky, .06), 'CL', .6); lit.push(caixaXf(-.16, y - .03 * ky, -.045, -.04, y, .045), caixaXf(.04, y - .03 * ky, -.045, .16, y, .045));
        return { lit, halo: null };
      default: lit.push(caixaXf(-.6, H - .13 * ky, -.17, .6, H - .07 * ky, .17)); hw = 1.6; hd = .9;
    }
    const hy = Math.min(y, H) - .05, halo = new THREE.PlaneGeometry(2 * hw * kx, 2 * hd * kz).rotateX(-Math.PI / 2).rotateY(ang).translate(x, hy, z);
    return { lit, halo };
  }
  // uma geometria do three (caixa, cilindro…) no acumulador do mundo, com a cor e a luz assada por vértice
  function geoAcc(A, g, col, bake) {
    const ng = g.index ? g.toNonIndexed() : g, P0 = ng.attributes.position;
    for (let i = 0; i < P0.count; i += 3) {
      const a = [P0.getX(i), P0.getY(i), P0.getZ(i)], b = [P0.getX(i + 1), P0.getY(i + 1), P0.getZ(i + 1)], c = [P0.getX(i + 2), P0.getY(i + 2), P0.getZ(i + 2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map(q => q / l);
      A.tri(a, b, c, col, col, col, bake(a, ...n), bake(b, ...n), bake(c, ...n));
    }
    if (ng !== g) ng.dispose(); g.dispose();
  }

  function luminarias(M, r) {
    if (TT) return luminariasTeto(M); // o teto da Forja (ForjaNivel.gd portado)
    const out = [], dentro = (rs, x, z, m) => rs.some(q => x >= q[0] + m && x <= q[2] - m && z >= q[1] + m && z <= q[3] - m);
    const grade = (rm, passo) => { const [x0, z0, x1, z1] = rm.b, nx = Math.max(1, Math.round((x1 - x0) / passo)), nz = Math.max(1, Math.round((z1 - z0) / passo));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const x = x0 + (a + .5) * (x1 - x0) / nx, z = z0 + (b + .5) * (z1 - z0) / nz;
        if (!dentro(rm.r, x, z, .4) || (rm === M.salao && M.comodos.some(c => dentro(c.r, x, z, 0)))) continue;
        const q = r(), round = rm.type === 'corredor';
        out.push({ x, z, s: q < quebr ? 0 : q < quebr + pisca ? 2 : 1, ph: r() * 100, round, rm: rm.id }); } };
    for (const rm of M.comodos) if (!rm.dark) grade(rm, Math.min(passoLuz, Math.max(3, Math.sqrt(rm.area) / 1.5)));
    if (M.salao && !M.salao.dark) grade(M.salao, passoLuz * D.par('forja', 'salao_passo', 1.2));
    return out;
  }

  const modulosEm = (x0, z0, x1, z1) => { const out = []; for (let i = Math.floor((x0 - 1) / S); i <= Math.floor((x1 + 1) / S); i++) for (let j = Math.floor((z0 - 1) / S); j <= Math.floor((z1 + 1) / S); j++) out.push(modulo(i, j)); return out; };
  // o segmento p + t·d (t de 0 a 1) entra no retângulo |u| ≤ hu, |v| ≤ hv?
  function corta(pu, pv, du, dv, hu, hv) { let t0 = 0, t1 = 1;
    for (const [p0, d, h] of [[pu, du, hu], [pv, dv, hv]]) { if (Math.abs(d) < 1e-9) { if (Math.abs(p0) > h) return false; continue; }
      let a = (-h - p0) / d, b = (h - p0) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
    return true; }
  function bloqueio(x0, z0, x1, z1, solido) {
    const dx = x1 - x0, dz = z1 - z0;
    for (const M of modulosEm(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1))) {
      for (const w of M.paredes) { if ((w.alt ?? H) < (solido ? .3 : 1.4)) continue;
        const ax = x0 - w.x, az = z0 - w.z; // no espaço da parede: u ao longo, v na espessura
        if (corta(ax * w.co - az * w.si, ax * w.si + az * w.co, dx * w.co - dz * w.si, dx * w.si + dz * w.co, w.comp / 2, (w.esp ?? .2) / 2)) return true; }
      if (solido) for (const b of M.caixas) { const hx = (b[2] - b[0]) / 2, hz = (b[3] - b[1]) / 2; if (corta(x0 - b[0] - hx, z0 - b[1] - hz, dx, dz, hx, hz)) return true; }
    }
    return false;
  }
  const arestas = new Map();
  // aberta se cabe uma passagem de 75 cm atravessando-a (= ForjaGen.edge_state da Godot)
  function arestaAberta(i, j, d) {
    const k = (i * 131071 + j) * 2 + d; let s = arestas.get(k); if (s !== undefined) return s;
    let seg = 0, melhor = 0;
    for (let q = 1; q < C / .25; q++) { const u = q * .25, livre = d === 0 ? !bloqueio(i * C + u, j * C - .45, i * C + u, j * C + .45, true) : !bloqueio(i * C - .45, j * C + u, i * C + .45, j * C + u, true);
      seg = livre ? seg + 1 : 0; melhor = Math.max(melhor, seg); }
    s = melhor >= 3; if (arestas.size > 300000) arestas.clear(); arestas.set(k, s); return s;
  }
  function moduloDe(x, z) { return modulo(Math.floor(x / S), Math.floor(z / S)); }
  function comodoEm(x, z) {
    if (externo(x, z)) return null;
    const M = moduloDe(x, z);
    for (const c of M.comodos) if (c.r.some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3])) return c;
    return M.salao;
  }
  function externo(x, z) { if (aberto) return true; const M = moduloDe(x, z); return M.ext.length > 0 && M.ext.some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]); }
  function livre(x, z, rr) { const M = moduloDe(x, z);
    if (M.caixas.some(b => x > b[0] - rr && x < b[2] + rr && z > b[1] - rr && z < b[3] + rr)) return false;
    return !M.paredes.some(w => { const ax = x - w.x, az = z - w.z; return Math.abs(ax * w.co - az * w.si) < w.comp / 2 + rr && Math.abs(ax * w.si + az * w.co) < (w.esp ?? .2) / 2 + rr; }); }

  // a luz assada (= bakeAt do index): luminárias acesas a até 7,5 m, a parede alta tapa; fora, o céu
  const vistaMemo = new Map();
  const luzMemo = new Map();
  function luz(x, y, z, nx, ny, nz) {
    const lk = Math.round(x * 8) * 73856093 ^ Math.round(y * 8) * 19349663 ^ Math.round(z * 8) * 83492791 ^ Math.round(nx * 2 + 3) * 7 ^ Math.round(ny * 2 + 3) * 131 ^ Math.round(nz * 2 + 3) * 1031;
    const lm = luzMemo.get(lk); if (lm !== undefined) return lm;
    const v = luzCru(x, y, z, nx, ny, nz); if (luzMemo.size > 500000) luzMemo.clear(); luzMemo.set(lk, v); return v;
  }
  // as luminárias acesas que podem alcançar o módulo (as dele e as dos 8 vizinhos), guardadas no módulo
  let nLamp = 0;
  function acesasPerto(M) {
    if (M.acesas) return M.acesas; const out = [];
    for (let i = M.ci - 1; i <= M.ci + 1; i++) for (let j = M.cj - 1; j <= M.cj + 1; j++) for (const f of modulo(i, j).lamps) { if (f.s !== 1) continue;
      for (const p of f.pts || [f]) { if (p.id === undefined) p.id = ++nLamp; out.push(p); } } // o teto da Forja: os pontos de luz de cada luminária
    return (M.acesas = out);
  }
  function luzCru(x, y, z, nx, ny, nz) {
    const sx = x + nx * .13, sz = z + nz * .13;
    if (externo(sx, sz)) return CEU + .12 * ny;
    let b = AMB; const ly = H - .12, rr = LUM.alcance, cel = (Math.floor(sx / .75) & 4095) * 4096 + (Math.floor(sz / .75) & 4095);
    for (const f of acesasPerto(moduloDe(sx, sz))) {
      const fr = f.alcance ?? rr, dx = f.x - x, dy = (f.y ?? ly) - y, dz = f.z - z; if (Math.abs(dx) > fr || Math.abs(dz) > fr) continue;
      const d = Math.hypot(dx, dy, dz); if (d > fr || d < 1e-3) continue;
      const dot = (dx * nx + dy * ny + dz * nz) / d; if (dot <= 0) continue;
      const kk = f.id * 16777216 + cel; let bl = vistaMemo.get(kk);
      if (bl === undefined) { bl = bloqueio(f.x, f.z, sx, sz, false); if (vistaMemo.size > 400000) vistaMemo.clear(); vistaMemo.set(kk, bl); }
      if (bl) continue;
      b += (f.forca ?? LUM.forca) * dot / (1 + (d / (f.queda ?? LUM.queda)) ** 2) * Math.min(1, Math.max(0, (fr - d) / (fr * .4)));
    }
    return Math.min(b, LUM.limite);
  }
  const lampsPerto = (x, z, r) => modulosEm(x - r, z - r, x + r, z + r).flatMap(M => M.lamps);

  // ---------------------------------------------------------------------------------------------- a geometria do bloco
  function mergeLit(gs) {
    const pos = [], nor = [];
    for (const g of gs) { const ng = g.index ? g.toNonIndexed() : g; pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); if (ng !== g) ng.dispose(); g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
  }
  function montar(ci, cj) {
    const M = modulo(ci, cj), L = M.L, cx = M.cx, cz = M.cz, w = L.largura, d = L.profundidade;
    const chao = new Acc(), par = new Acc(), obj = new Acc(), brilho = [], vivas = [], mortas = [], halos = [], pisc = [];
    const bk = (p, nx, ny, nz) => ny < -.5 ? 0 : luz(p[0], p[1], p[2], nx, ny, nz);
    const pisoId = Object.fromEntries((vis.pisos || []).map(x => [x.id, x])), wId = Object.fromEntries((vis.paredes || []).map(x => [x.id, x])), w0 = (vis.paredes || [])[0];
    // chão de fundo (a sobra entre o layout e o bloco) e as regiões de piso
    const b0 = vis.pisos?.[0] || { cls: N.piso_cls || 'CL', v: N.piso_v ?? .6 };
    const plano = (x0, z0, x1, z1, y, C2, passo) => { const nx = Math.max(1, Math.ceil((x1 - x0) / passo)), nz = Math.max(1, Math.ceil((z1 - z0) / passo));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const xa = x0 + (x1 - x0) * a / nx, xb = x0 + (x1 - x0) * (a + 1) / nx, za = z0 + (z1 - z0) * b / nz, zb = z0 + (z1 - z0) * (b + 1) / nz;
        const pts = [[xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za]]; chao.quad(...pts, ...pts.map(q => C2(q[0], q[2])), pts.map(q => luz(q[0], 0, q[2], 0, 1, 0))); } };
    plano(M.x0, M.z0, M.x1, M.z1, -.004, () => cor(b0.cls, (b0.v ?? .6) * .85), 1.5);
    const cam = P.camadas(L.chao || []), enc = (v, lim, S2) => Math.abs(v - lim) < .01 ? S2 : v;
    (L.chao || []).forEach((g, k) => { const s = pisoId[g.p]; if (!s) return; const y0 = P.ALT.base(cam[k]), seed = (L.semente || 1) * 31 + (g.s ?? k);
      let x0 = g.x0, z0 = g.z0, x1 = g.x1, z1 = g.z1;
      if (cam[k] === 0) { x0 = enc(x0, -w / 2, -S / 2); x1 = enc(x1, w / 2, S / 2); z0 = enc(z0, -d / 2, -S / 2); z1 = enc(z1, d / 2, S / 2); } // o piso da borda vai até a borda do bloco
      if (s.padrao === 'organico') { const blob = s.papel === 'detalhe' || cam[k] > 0, st = blob ? .3 : .75;
        const nx = Math.max(1, Math.ceil((x1 - x0) / st)), nz = Math.max(1, Math.ceil((z1 - z0) / st));
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const xa = x0 + (x1 - x0) * a / nx, xb = x0 + (x1 - x0) * (a + 1) / nx, za = z0 + (z1 - z0) * b / nz, zb = z0 + (z1 - z0) * (b + 1) / nz;
          if (blob && !P.dentroMancha(g, (xa + xb) / 2, (za + zb) / 2, seed)) continue;
          const pts = [[xa, y0, za], [xa, y0, zb], [xb, y0, zb], [xb, y0, za]];
          chao.quad(...pts.map(q => [q[0] + cx, q[1], q[2] + cz]), ...pts.map(q => { const [c, v] = P.tomOrganico(s, q[0], q[2], seed); return cor(c, v); }), pts.map(q => luz(q[0] + cx, 0, q[2] + cz, 0, 1, 0))); }
        return; }
      P.quadsPiso(s, x0, z0, x1, z1, seed).forEach(([qx0, qz0, qx1, qz1, ci2, v], n) => { const y = n === 0 ? y0 : y0 + P.ALT.peca + (ci2 === 1 ? P.ALT.cruz : 0), cls = P.clsDe(s, ci2);
        const passo = n === 0 ? .75 : 1e9, nx = Math.max(1, Math.ceil((qx1 - qx0) / passo)), nz = Math.max(1, Math.ceil((qz1 - qz0) / passo));
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const xa = qx0 + (qx1 - qx0) * a / nx, xb = qx0 + (qx1 - qx0) * (a + 1) / nx, za = qz0 + (qz1 - qz0) * b / nz, zb = qz0 + (qz1 - qz0) * (b + 1) / nz;
          const pts = [[xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za]];
          chao.quad(...pts.map(q => [q[0] + cx, q[1], q[2] + cz]), ...pts.map(q => cor(cls, v * P.mancha(s, q[0], q[2], seed))), pts.map(q => luz(q[0] + cx, 0, q[2] + cz, 0, 1, 0))); } }); });
    for (const [x0, z0, x1, z1, cls, v] of L.camadas_chao || []) { const c = cor(cls, v), pts = [[x0 + cx, .038, z0 + cz], [x0 + cx, .038, z1 + cz], [x1 + cx, .038, z1 + cz], [x1 + cx, .038, z0 + cz]]; chao.quad(...pts, c, c, c, c, pts.map(q => luz(q[0], 0, q[2], 0, 1, 0))); }
    if (!(L.chao || []).length) plano(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0, () => cor(N.piso_cls || 'CL', N.piso_v ?? .6), .75);
    // paredes com o estilo de cada uma (topo escuro, como o corte das paredes do index)
    const topo = cor('AZ', D.L.tons?.topo ?? .05), boxes = [];
    for (const p of M.paredes) { const s = wId[p.e] || w0, esp = p.esp ?? .2, alt = p.alt ?? H;
      if (!s) caixa(par, [-p.comp / 2, 0, -esp / 2, p.comp / 2, alt, esp / 2], p.x, p.z, p.rot, cor(N.parede_cls || 'N', N.parede_v ?? .75), bk, topo);
      else { const ua = (p.x - cx) * p.co - (p.z - cz) * p.si; for (const q of P.pecasParede(s, p.comp, alt, esp, 1, ua)) caixa(par, q, p.x, p.z, p.rot, cor(q[6], q[7]), bk, q[4] >= alt - .01 ? topo : null); }
      // colisão: caixas alinhadas (a parede girada vira uma fileira de caixinhas)
      const r = ((p.rot % 180) + 180) % 180, hx = p.comp / 2, he = esp / 2;
      if (r < .5 || r > 179.5) boxes.push([p.x - hx, p.z - he, p.x + hx, p.z + he]);
      else if (Math.abs(r - 90) < .5) boxes.push([p.x - he, p.z - hx, p.x + he, p.z + hx]);
      else for (let t = -hx; t < hx; t += .3) { const px = p.x + t * p.co, pz = p.z - t * p.si; boxes.push([px - he - .1, pz - he - .1, px + he + .1, pz + he + .1]); } }
    // portas: batente, verga, soleira e a faixa acesa em cima
    const pt = vis.porta || { cls: 'AC', v: .95 }, fw = .13, fc = cor(pt.cls, pt.v);
    for (const q of M.portas) { const hg = q.larg / 2, dep = (q.esp ?? .2) / 2 + .03, vg = Math.min(2.1, (q.alt ?? H) - .1);
      for (const b of [[-hg - fw, 0, -dep, -hg, vg + fw, dep], [hg, 0, -dep, hg + fw, vg + fw, dep], [-hg - fw, vg, -dep, hg + fw, vg + fw, dep], [-hg, 0, -dep + .03, hg, .025, dep - .03]]) caixa(par, b, q.x, q.z, q.rot, fc, bk);
      if ((q.alt ?? H) > vg + fw + .05) caixa(par, [-hg, vg + fw, -(q.esp ?? .2) / 2, hg, q.alt ?? H, (q.esp ?? .2) / 2], q.x, q.z, q.rot, w0 ? cor(w0.cls, w0.v) : cor('N', .78), bk, topo);
      if (pt.sinal !== false) brilho.push(new THREE.BoxGeometry(q.larg + 2 * fw, .03, .34).rotateY(rad(q.rot)).translate(q.x, (q.alt ?? H) + .04, q.z)); }
    // coisas nas paredes (quadros, pôsteres)
    try { const wq = vis.quadros || []; if (wq.length && (L.paredes || []).length) { const Lc = P.comComodos({ ...L });
      for (const it of P.quadrosNaParede(Lc, wq, wId)) { const p = L.paredes[it.p]; for (const b of P.pecasNaParede(it, wq[it.q], p.esp)) caixa(par, b, p.x + cx, p.z + cz, p.rot, cor(b[6], b[7]), bk); } } } catch { /* sem quadros */ }
    // objetos: modelo do Blender (.glb) ou a receita do objeto padrão; sem nenhum, uma caixa com a medida
    const glbs = [];
    for (const ob of M.objs) { const e = ob.e, s = (ob.escala || 1) * (e.tam || 1), y = ob.y || 0, a = rad(ob.rot);
      const k = luz(ob.x, y + .5, ob.z, 0, 1, 0), modelo = e.glb && D.modelos?.[ob.elemento], ev = comVariacaoDoNivel(e, N.variacao), ch = chaveCopia(ob.elemento, ob.lx, ob.lz, M.L.semente, M.ci, M.cj);
      const fv = valorCopia(ev, ch), corV = fv === 1 ? cor : (cls, v) => cor(cls, v * fv), mc = corCopia(ev, ch, D.hue, DEGRADE), v0 = obj.p.length / 3;
      if (modelo) { glbs.push({ eid: ob.elemento, x: ob.x, y, z: ob.z, a, s, k, ...(fv !== 1 ? { v: fv } : {}), ...(mc ? { cor: mc } : {}) }); continue; }
      if (e.receita?.length) receita(obj, e.receita, { x: ob.x, y, z: ob.z, co: Math.cos(a), si: Math.sin(a), s }, corV, k);
      else caixa(obj, [-e.w / 2, 0, -e.d / 2, e.w / 2, e.h, e.d / 2].map((v, i) => i === 1 ? y : i === 4 ? y + e.h * s : v * s), ob.x, ob.z, ob.rot, corV('CL', .6), () => k);
      if (mc) { const v1 = obj.p.length / 3; recolorir(obj.c, v0, v1, corDominante(obj.p, obj.c, null, v0, v1), mc); } }
    // coisas no chão: cada pedaço (cobertura × variante) montado uma vez e repetido (até um teto por bloco)
    const ped = new Map(), cobs = vis.coberturas || [], maxC = D.par('forja', 'coisas_max_bloco', 260), kc = luz(cx, .3, cz, 0, 1, 0);
    for (const [i, va, x, z, rot] of (L.cobre || []).slice(0, maxC)) { const c = cobs[i]; if (!c) continue; const kk = i + ':' + va;
      if (!ped.has(kk)) { const A = new Acc(); try { receita(A, P.pedacoCobertura(c, va, i), { x: 0, y: 0, z: 0, co: 1, si: 0, s: 1 }, cor, kc); } catch { /* tipo novo */ } ped.set(kk, { A, pos: [] }); }
      ped.get(kk).pos.push([x + cx, z + cz, rot]); }
    // luminárias (o mesmo desenho das do index: tubo ou redonda, halo embaixo; as que piscam ficam soltas)
    const vents = [];
    if (TT) for (const v of M.vents || []) {
      const p = TT.ventiladores[v.t] || {}, s = v.esc, motor = (+p.motor || .12) * s, raio = (+p.raio || .6) * s, larg = (+p.larg || .13) * s, rmo = Math.max(.07, raio * .17);
      const tc = +p.tom_corpo || .45, tp = +p.tom_pa || .55, yM = v.teto - v.haste, lv = luz(v.x, yM - motor, v.z, 0, -1, 0), assada = () => lv;
      const cil = (r, y0, y1, seg, rt = -1) => new THREE.CylinderGeometry(rt < 0 ? r : rt, r, Math.max(.005, y1 - y0), seg).translate(v.x, (y0 + y1) / 2, v.z);
      geoAcc(obj, cil(.075 * s, v.teto - .035, v.teto, 10, .055 * s), cor('AC', tc), assada); // canopla
      geoAcc(obj, new THREE.BoxGeometry(.016 * s, v.teto - .035 - yM, .016 * s).translate(v.x, (v.teto - .035 + yM) / 2, v.z), cor('AZ', tc * .8), assada); // haste
      geoAcc(obj, cil(rmo, yM - motor, yM, 14, rmo * .75), cor('AC', tc), assada); // motor
      geoAcc(obj, cil(rmo * .55, yM - motor - .02, yM - motor, 12), cor('AC', tc * .8), assada); // tampa de baixo
      if (v.luz) { const yb = yM - motor - .02; vivas.push(cil(.11 * s, yb - .13 * s, yb, 12, .05 * s)); }
      const pas = new Acc(), n = Math.min(8, Math.max(2, Math.round(+p.pas || 4))), inc = (+p.inclina || 10) * Math.PI / 180;
      for (let k = 0; k < n; k++) { const xf = (g) => g.rotateX(inc).rotateY(Math.PI * 2 * k / n);
        geoAcc(pas, xf(new THREE.BoxGeometry(rmo + .08 * s - rmo * .5, .018, .044 * s).translate((rmo * .5 + rmo + .08 * s) / 2, -.003, 0)), cor('AC', tc * .8), assada); // braço
        geoAcc(pas, xf(new THREE.BoxGeometry(raio - rmo - .04 * s, .014, larg).translate((rmo + .04 * s + raio) / 2, 0, 0)), cor('AC', tp), assada); } // pá
      vents.push({ x: v.x, y: yM - motor * .55, z: v.z, ang: v.ang, rpm: v.rpm, geo: pas.geo(THREE) });
    }
    if (TT) for (const f of M.lamps) {
      if (f.semDesenho) continue; // a luz do ventilador: só o ponto de luz
      const d0 = desenhaLuminaria(f, obj, bk), mesh = d0.lit.length ? mergeLit(d0.lit) : null;
      if (f.mortasExtra) { for (const g of f.mortasExtra) mortas.push(g); delete f.mortasExtra; } // (o worker serializa a luminária)
      if (!mesh) continue;
      if (f.s === 1) { vivas.push(mesh); if (d0.halo) halos.push(d0.halo); } else if (f.s === 0) { mortas.push(mesh); d0.halo?.dispose(); }
      else pisc.push({ f, geo: mesh, halo: d0.halo || new THREE.PlaneGeometry(.1, .1).rotateX(-Math.PI / 2).translate(f.x, H - .15, f.z) });
    }
    else for (const f of M.lamps) { const geo = (f.round ? new THREE.CylinderGeometry(.6, .6, .06, 12) : new THREE.BoxGeometry(1.2, .06, .34)).translate(f.x, H - .1, f.z);
      const halo = () => (f.round ? new THREE.PlaneGeometry(2.6, 2.6) : new THREE.PlaneGeometry(3.2, 1.8)).rotateX(-Math.PI / 2).translate(f.x, H - .15, f.z);
      if (f.s === 1) { vivas.push(geo); halos.push(halo()); } else if (f.s === 0) mortas.push(geo); else pisc.push({ f, geo, halo: halo() }); }
    for (const b of M.caixas) boxes.push(b);
    return { M, S, chao: chao.vazio() ? null : chao.geo(THREE), paredes: par.vazio() ? null : par.geo(THREE), objetos: obj.vazio() ? null : obj.geo(THREE), glbs,
             coisas: [...ped.values()].filter(x => !x.A.vazio()).map(x => ({ geo: x.A.geo(THREE), pos: x.pos })), brilho, vivas, mortas, halos, pisc, boxes, teto: !aberto, vents };
  }

  // onde o andarilho começa (no bloco 0,0) e um ponto livre perto de um alvo (a saída)
  function inicio() { const M = modulo(0, 0); return [M.cx + M.L.inicio[0], M.cz + M.L.inicio[1]]; }
  function livreNoMundo(x, z, rr = .6) {
    for (let r = 0; r < 30; r += 1.5) for (let k = 0; k < Math.max(1, Math.round(r * 4)); k++) { const a = k / Math.max(1, Math.round(r * 4)) * 6.283, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (livre(px, pz, rr) && !externoBloqueado(px, pz)) return [px, pz]; }
    return [x, z];
  }
  const externoBloqueado = () => false;
  function superficie(x, z) { const c = comodoEm(x, z); return c ? c.piso : 'terra'; }
  function nome(x, z) { const c = comodoEm(x, z); if (!c) return ''; const f = (R.funcoes || []).find(q => q.id === c.type); return f?.nome || ''; }
  function injetar(ci, cj, L) { if (!mods.has(key(ci, cj))) injetados.set(key(ci, cj), L); }
  return { S, C, H, aberto, modulo, injetar, montar, bloqueio, arestaAberta, comodoEm, externo, luz, livre, livreNoMundo, inicio, superficie, nome, lampsPerto };
}

// o bloco montado em arrays simples (vai do worker para o jogo sem cópia; o jogo cria as malhas com desserializar)
export function serializar(R) {
  const geo = (g) => { if (!g) return null; const a = {}; for (const [k, v] of Object.entries(g.attributes)) a[k] = [v.array, v.itemSize]; return { a, i: g.index ? g.index.array : null }; };
  const M = R.M;
  return { S: R.S, teto: R.teto, boxes: R.boxes, chao: geo(R.chao), paredes: geo(R.paredes), objetos: geo(R.objetos), glbs: R.glbs,
    coisas: R.coisas.map(c => ({ geo: geo(c.geo), pos: c.pos })), brilho: R.brilho.map(geo), vivas: R.vivas.map(geo), mortas: R.mortas.map(geo), halos: R.halos.map(geo),
    pisc: R.pisc.map(p => ({ f: p.f, geo: geo(p.geo), halo: geo(p.halo) })), vents: (R.vents || []).map(v => ({ ...v, geo: geo(v.geo) })),
    M: { cx: M.cx, cz: M.cz, x0: M.x0, z0: M.z0, x1: M.x1, z1: M.z1, comodos: M.comodos.map(c => ({ x0: c.x0, y0: c.y0, b: c.b })) } };
}
export function desserializar(THREE, g) {
  if (!g) return null; const q = new THREE.BufferGeometry();
  for (const [k, [arr, n]] of Object.entries(g.a)) q.setAttribute(k, new THREE.BufferAttribute(arr, n));
  if (g.i) q.setIndex(new THREE.BufferAttribute(g.i, 1)); return q;
}
