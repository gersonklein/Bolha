// Gerador de layouts da Forja: o mesmo conjunto de elementos organizado de 48 maneiras.
// Tudo procedural e determinístico (estilo + semente → sempre o mesmo layout), instantâneo, sem IA.
import { enfeitar, cssDe } from './pisos.js';
import { inspecionar } from './inspetor.js';
import { REGRAS, opcoes, barreiras, tipoBarreira, elementoNoEstilo } from './criterios.js';
let _corPiso = null; export function usarCorPisos(f) { _corPiso = f; } // corDeHex das classes do jogo: a planta mostra o piso de cada região
// Coordenadas da Godot em metros: x → direita, z → câmera; chão centrado na origem. rot (graus) em torno de y;
// rot 0 = frente do objeto voltada para +z (a câmera). Paredes: {x, z, rot, comp, alt, esp}.

export const FAMILIAS = {
  abertos: 'Abertos', ordenados: 'Ordenados', organicos: 'Orgânicos', arquitetura: 'Arquitetura (paredes)', cenicos: 'Cênicos', caoticos: 'Caóticos', jogo: 'Do jogo (níveis 0–4)',
};

const rad = (g) => g * Math.PI / 180, grau = (r) => r * 180 / Math.PI;
const virado = (x, z, tx, tz) => grau(Math.atan2(tx - x, tz - z)); // rot que aponta a frente para (tx, tz)
const ao_longo = (a) => grau(Math.atan2(Math.cos(a), -Math.sin(a))) - 90; // rot com a frente seguindo a direção a (no plano x,z)
function meia(w, d, rot) { const c = Math.abs(Math.cos(rad(rot))), s = Math.abs(Math.sin(rad(rot))); return [c * w / 2 + s * d / 2, s * w / 2 + c * d / 2]; }
const grande = (e) => e.w * e.d > 3 || e.h > 2.2;
// 3 casas: arredonda em número antes de formatar (o toFixed do JS e o "%.3f" da Godot discordam quando cai na metade, ex. 10,5305)
const f3 = (v) => +(Math.round(v * 1e3) / 1e3).toFixed(3);

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.entre = (x, y) => x + (y - x) * r();
  r.int = (x, y) => Math.floor(r.entre(x, y + 1 - 1e-9));
  r.um = (arr) => arr[Math.floor(r() * arr.length)];
  r.gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) / 0.58; };
  r.embaralha = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return r;
}

// ------------------------------------------------------------------------------------------------ plano (colisão simples por caixas)
// o vão entre dois conjuntos nas salas (forja/circulacao.py: o andarilho tem raio 0,3 m): encostado ou dá para passar
const JUNTO = .15, PASSAGEM = .75; // 60 cm do corpo + 15 de folga
class Plano {
  constructor(W, D, r, o) { this.W = W; this.D = D; this.r = r; this.o = o; this.rects = []; this.inst = []; this.instG = []; this.paredes = []; this.inicio = [0, D / 2 - 1.6]; this.alt = 2.6; this.esp = .2; this.cel = 3; this.conj = 0; this.nconj = 0; }
  livre(x, z, hx, hz, folga) {
    if (x - hx < -this.W / 2 + .15 || x + hx > this.W / 2 - .15 || z - hz < -this.D / 2 + .15 || z + hz > this.D / 2 - .15) return false;
    const [ix, iz] = this.inicio; if (Math.abs(x - ix) < hx + 1.5 && Math.abs(z - iz) < hz + 1.5) return false;
    for (const q of this.rects) if (Math.abs(x - q.x) < hx + q.hx + Math.max(folga, q.f) && Math.abs(z - q.z) < hz + q.hz + Math.max(folga, q.f)) return false;
    return true;
  }
  reservar(x, z, hx, hz, f = 0) { this.rects.push({ x, z, hx, hz, f }); }
  // CIRCULAÇÃO entre conjuntos (= ForjaLayout.gd passa): peça de um conjunto (g) e peça de outro, ou a parede, ficam
  // encostadas (vão até JUNTO: viram um bloco só) ou com um vão por onde o andarilho passa (PASSAGEM). O vão do meio
  // — largo demais para encostar, estreito demais para passar — é o que trava o caminho e não é aceito.
  passa(x, z, hx, hz, g) {
    for (const q of this.rects) { if (!(q.k === 'p' || (q.k === 'o' && q.g !== g))) continue;
      const gx = Math.abs(x - q.x) - hx - q.hx, gz = Math.abs(z - q.z) - hz - q.hz, v = Math.hypot(Math.max(gx, 0), Math.max(gz, 0));
      if (v > JUNTO && v < PASSAGEM) return false; }
    return true;
  }
  // g: o conjunto da peça (0 = sem a regra da passagem: os estilos soltos, que já têm a folga deles)
  por(e, x, z, rot = 0, esc = 1, folga = .5, g = 0) {
    const [hx, hz] = meia(e.w * esc, e.d * esc, rot);
    if (!this.livre(x, z, hx, hz, folga)) return false;
    if (g && !this.passa(x, z, hx, hz, g)) return false;
    this.rects.push({ x, z, hx, hz, f: folga * .5, k: 'o', g });
    this.inst.push({ elemento: e.id, x: f3(x), z: f3(z), rot: +(((rot % 360) + 360) % 360).toFixed(1), escala: +esc.toFixed(3) }); this.instG.push(g);
    return true;
  }
  // um conjunto (a fileira de mesas, a mesa com as cadeiras, a roda): o que se põe até solto(antes) fica junto
  junto() { const antes = this.conj; this.conj = ++this.nconj; return antes; }
  solto(antes) { this.conj = antes; }
  // em cima de outra peça (monitor no tampo): não ocupa chão; y = a altura do apoio
  sobre(e, x, z, rot, y) { this.inst.push({ elemento: e.id, x: f3(x), z: f3(z), rot: +(((rot % 360) + 360) % 360).toFixed(1), escala: 1, y: f3(y) }); this.instG.push(0); }
  tentar(e, n, sorteio, folga) { for (let k = 0; k < n; k++) { const s = sorteio(k); if (s && this.por(e, s[0], s[1], s[2] ?? 0, s[3] ?? 1, folga)) return true; } return false; }
  parede(x0, z0, x1, z1, alt = this.alt, esp = this.esp) {
    const comp = Math.hypot(x1 - x0, z1 - z0); if (comp < .05) return;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, rot = grau(Math.atan2(-(z1 - z0), x1 - x0));
    this.paredes.push({ x: f3(x), z: f3(z), rot: +rot.toFixed(1), comp: f3(comp + esp), alt: +alt.toFixed(2), esp: +esp.toFixed(2) });
    const [hx, hz] = meia(comp + esp, esp, rot); this.rects.push({ x, z, hx, hz, f: .04, k: 'p' });
  }
  pilar(x, z, lado = .5, alt = this.alt) { this.paredes.push({ x: +x.toFixed(3), z: +z.toFixed(3), rot: 0, comp: lado, alt, esp: lado }); this.rects.push({ x, z, hx: lado / 2, hz: lado / 2, f: .2, k: 'p' }); }
  U(mx = .48, z0 = -.48, z1 = .44) { return [this.r.entre(-mx, mx) * this.W, this.r.entre(z0, z1) * this.D]; }
}

// "sacola": quantas peças de cada elemento, das maiores para as menores
function sacola(P, els, k) {
  const r = P.r, out = [];
  for (const e of els) { const v = e.qtd * P.o.densidade * k * r.entre(.75, 1.25), n = P.o.fracao ? Math.floor(v + r()) : Math.max(1, Math.round(v)); for (let i = 0; i < n; i++) out.push(e); } // na mistura cada zona leva uma fração: arredonda ao acaso
  // das maiores para as menores; no empate, a ordem de um sorteio feito antes (o sort não chama o sorteio: assim a
  // Godot, que porta este arquivo em ForjaLayout.gd, monta exatamente o mesmo layout)
  const ks = out.map(() => r());
  return out.map((e, i) => [e, ks[i]]).sort((a, b) => b[0].w * b[0].d - a[0].w * a[0].d || a[1] - b[1]).map(x => x[0]);
}

// ------------------------------------------------------------------------------------------------ blocos livres
function espalhar(P, els, { k = 1, folga = .5, tent = 70, pos, rot, esc, peso } = {}) {
  const r = P.r;
  for (const e of sacola(P, els, k)) P.tentar(e, tent, (t) => {
    let x, z;
    if (pos) [x, z] = pos(e, t); else [x, z] = P.U();
    if (peso && r() > peso(x, z, e) && t < tent - 5) return null;
    return [x, z, rot ? rot(x, z, e) : r.int(0, 3) * 90, esc ? r.entre(esc[0], esc[1]) : 1];
  }, folga);
}
// fileiras retas num ângulo; tipo por fileira, ou alternando (xadrez); rot da peça por fileira
function fileiras(P, els, { k = 1.1, ang = 0, corredor = 1.8, vao = .7, alterna = false, xadrez = false, falha = 0, torto = 0, rotFila, regiao } = {}) {
  const r = P.r, bag = sacola(P, els, k); if (!bag.length) return;
  const tipos = [...new Set(bag)], c = Math.cos(rad(ang)), s = Math.sin(rad(ang)), R = Math.hypot(P.W, P.D) / 2;
  let v = -R, fila = 0;
  while (v < R && bag.length) {
    const e = xadrez ? null : tipos[fila % tipos.length], prof = (e || tipos[0]).d, passo = Math.max(...(xadrez ? tipos.slice(0, 2) : [e]).map(t => t.w)) + vao;
    let col = 0;
    for (let u = -R; u < R; u += passo, col++) {
      const t = xadrez ? tipos[(fila + col) % Math.min(2, tipos.length)] : e, j = bag.indexOf(t);
      if (j < 0 || r() < falha) continue;
      const x = u * c - (v + prof / 2) * s, z = u * s + (v + prof / 2) * c;
      if (regiao && !regiao(x, z)) continue;
      const rot = (rotFila ? rotFila(fila, x, z) : (alterna && fila % 2 ? 180 : 0)) - ang + (torto ? r.gauss() * torto : 0);
      if (P.por(t, x, z, rot, 1, .12)) bag.splice(j, 1);
    }
    v += prof + (alterna && fila % 2 === 0 ? .35 : corredor); fila++;
  }
}
// ao longo de uma polilinha: peças nas margens (ou em cima), viradas para o caminho ou seguindo-o
function margens(P, els, pts, { k = 1, largura = 1, dist = [.4, 1.6], lados = 2, folga = .3, sobre = false, reserva = true, passo = .25 } = {}) {
  const r = P.r, cam = [];
  for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let t = 0; t < L; t += passo) cam.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L, ang]); }
  if (!cam.length) return cam;
  if (reserva && !sobre) for (const [x, z] of cam) P.reservar(x, z, largura / 2, largura / 2, .05);
  if (sobre) { let i = 0; for (const e of sacola(P, els, k)) { for (; i < cam.length; i += 2) { const [x, z, a] = cam[i]; if (P.por(e, x, z, ao_longo(a), 1, folga)) { i += 2; break; } } } return cam; }
  for (const e of sacola(P, els, k)) P.tentar(e, 60, () => {
    const [x, z, a] = r.um(cam), lado = lados === 1 ? 1 : (r() < .5 ? 1 : -1), d = largura / 2 + e.d / 2 + r.entre(dist[0], dist[1]) * (grande(e) ? 1.6 : 1);
    const px = x - Math.sin(a) * d * lado, pz = z + Math.cos(a) * d * lado; return [px, pz, virado(px, pz, x, z)];
  }, folga);
  return cam;
}
// arcos/anéis em volta de um foco, viradas para ele
function arcos(P, els, { centro = [0, 0], r0 = 2.5, gap = 1.6, a0 = 0, a1 = 2 * Math.PI, focal = true, k = 1, virar = true } = {}) {
  const r = P.r, bag = sacola(P, els, k), [fx, fz] = centro;
  if (focal && bag.length) { const f = bag.shift(); P.por(f, fx, fz, virar ? 0 : r.int(0, 3) * 90, 1, .6); r0 += Math.max(f.w, f.d) / 2; }
  const tipos = [...new Set(bag)]; let raio = r0, anel = 0;
  while (bag.length && raio < Math.hypot(P.W, P.D) / 2 && anel < 40) {
    const e = tipos[anel % tipos.length], arco = (a1 - a0) * raio, n = Math.max(2, Math.floor(arco / (e.w + .9))), off = r.entre(0, 1);
    for (let i = 0; i < n; i++) { const j = bag.indexOf(e); if (j < 0) break; const a = a0 + (a1 - a0) * ((a1 - a0 >= 6.28 ? i + off : i + .5) / n), x = fx + Math.cos(a) * raio, z = fz + Math.sin(a) * raio;
      if (P.por(e, x, z, virar ? virado(x, z, fx, fz) : grau(a), 1, .15)) bag.splice(j, 1); }
    raio += e.d + gap; anel++;
  }
}
function aglomerados(P, els, { n = [3, 6], raio = [1.2, 2], k = 1, folga = .3, temas = true, centros, virar = .5 } = {}) {
  const r = P.r, cs = centros || [];
  if (!centros) { const q = r.int(n[0], n[1]); for (let i = 0; i < q * 10 && cs.length < q; i++) { const c = P.U(.38, -.42, .3); if (cs.every(d => Math.hypot(c[0] - d[0], c[1] - d[1]) > Math.min(P.W, P.D) / (q * .6))) cs.push(c); } }
  if (!cs.length) cs.push([0, 0]);
  const tem = cs.map(() => r.embaralha([...els]).slice(0, r.int(1, 2)));
  for (const e of sacola(P, els, k)) {
    const opc = cs.map((_, i) => i).filter(i => !temas || tem[i].includes(e)), [cx, cz] = cs[opc.length ? r.um(opc) : r.int(0, cs.length - 1)];
    P.tentar(e, 60, (t) => { const rr = raio[0] + t * .05 + Math.abs(r.gauss()) * raio[1], a = r.entre(0, 6.283), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      return [x, z, r() < virar ? virado(x, z, cx, cz) : r.entre(0, 360)]; }, folga);
  }
  return cs;
}
function focoNoFundo(P, els) { const bag = [...els].sort((a, b) => b.w * b.d - a.w * a.d), f = bag[0]; if (!f) return [0, -P.D / 2 + 1]; const z = -P.D / 2 + f.d / 2 + .8; P.por(f, 0, z, 0, 1, .8); return [0, z]; }

// ------------------------------------------------------------------------------------------------ blocos com paredes (grade de células)
function grade(P, cel = 3) { P.cel = cel; const cols = Math.max(3, Math.round(P.W / cel)), rows = Math.max(3, Math.round(P.D / cel)); P.W = cols * cel; P.D = rows * cel; P.inicio = [0, P.D / 2 - 1.6]; return { cols, rows }; }
const CX = (P, i) => -P.W / 2 + (i + .5) * P.cel, CZ = (P, j) => -P.D / 2 + (j + .5) * P.cel;
const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 norte(-z) 1 leste 2 sul(+z) 3 oeste
function vazio(g) { return Array.from({ length: g.cols }, () => Array.from({ length: g.rows }, () => [false, false, false, false])); }
function abrir(ab, g, i, j, l) { const [di, dj] = DIR[l], a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= g.cols || b >= g.rows) return; ab[i][j][l] = true; ab[a][b][(l + 2) % 4] = true; }
function erguer(P, g, ab, dentro = () => true) {
  const { cols, rows } = g, c = P.cel;
  for (let j = 0; j <= rows; j++) { let ini = null;
    for (let i = 0; i <= cols; i++) { const a = j > 0 && i < cols && dentro(i, j - 1), b = j < rows && i < cols && dentro(i, j), tem = i < cols && (a || b) && !(a && b && ab[i][j][0]);
      if (tem && ini === null) ini = i; if (!tem && ini !== null) { P.parede(-P.W / 2 + ini * c, -P.D / 2 + j * c, -P.W / 2 + i * c, -P.D / 2 + j * c); ini = null; } } }
  for (let i = 0; i <= cols; i++) { let ini = null;
    for (let j = 0; j <= rows; j++) { const a = i > 0 && j < rows && dentro(i - 1, j), b = i < cols && j < rows && dentro(i, j), tem = j < rows && (a || b) && !(a && b && ab[i][j][3]);
      if (tem && ini === null) ini = j; if (!tem && ini !== null) { P.parede(-P.W / 2 + i * c, -P.D / 2 + ini * c, -P.W / 2 + i * c, -P.D / 2 + j * c); ini = null; } } }
}
function abrirIguais(ab, g, mapa) { for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { if (mapa[i][j] < 0) continue; if (i + 1 < g.cols && mapa[i + 1][j] === mapa[i][j]) abrir(ab, g, i, j, 1); if (j + 1 < g.rows && mapa[i][j + 1] === mapa[i][j]) abrir(ab, g, i, j, 2); } }
// portas entre regiões de um mapa (−1 = maciço). hub: todas ligam só a ele; cadeia: só à próxima; senão árvore + extras
function portas(P, g, ab, mapa, { hub = null, cadeia = null, extras = .25 } = {}) {
  const r = P.r, fr = [];
  for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) for (const l of [1, 2]) { const a = i + (l === 1), b = j + (l === 2);
    if (a < g.cols && b < g.rows && mapa[i][j] >= 0 && mapa[a][b] >= 0 && mapa[a][b] !== mapa[i][j]) fr.push({ i, j, l, s: mapa[i][j], t: mapa[a][b] }); }
  r.embaralha(fr); const par = (f) => [f.s, f.t].sort((x, y) => x - y).join(), feitos = new Set();
  const usa = (f) => { abrir(ab, g, f.i, f.j, f.l); feitos.add(par(f)); };
  if (hub !== null) { for (const f of fr) if ((f.s === hub || f.t === hub) && !feitos.has(par(f))) usa(f); return; }
  if (cadeia) { for (let k = 0; k < cadeia.length - 1; k++) { const f = fr.find(f => par(f) === [cadeia[k], cadeia[k + 1]].sort((x, y) => x - y).join()); if (f) usa(f); } return; }
  const ids = [...new Set(mapa.flat().filter(v => v >= 0))], lig = new Set([ids[0]]);
  for (let mud = true; mud;) { mud = false; for (const f of fr) if (lig.has(f.s) !== lig.has(f.t)) { usa(f); lig.add(f.s); lig.add(f.t); mud = true; break; } }
  for (const f of fr) if (!feitos.has(par(f)) && r() < extras) usa(f);
}
function mapaVazio(g, v = 0) { return Array.from({ length: g.cols }, () => Array(g.rows).fill(v)); }
function inicioEm(P, g, dentro = () => true) { for (let jj = g.rows - 1; jj >= 0; jj--) for (let d = 0; d < g.cols; d++) for (const i of [Math.floor(g.cols / 2) + d, Math.floor(g.cols / 2) - d]) if (i >= 0 && i < g.cols && dentro(i, jj)) { P.inicio = [CX(P, i), CZ(P, jj)]; return; } }
// mobília: encostada nas paredes (virada para dentro); grandes no meio das células/salas
// salas (opcional): {de(i, j) → índice da sala ou -1, f: [função de cada sala]} — um elemento com cômodos (diretrizes) só
// entra em sala da sua função; o genérico entra em qualquer lugar. centros, se vierem com salas, são os das salas (mesma ordem)
function mobiliar(P, g, ab, els, { k = 1, dentro = () => true, centros = null, salas = null } = {}) {
  if (salas && P.prog) return mobiliarProg(P, g, ab, els, { k, dentro, salas });
  const r = P.r, c = P.cel, vagas = [];
  for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { if (!dentro(i, j)) continue; const f = [0, 1, 2, 3].filter(l => !ab[i][j][l]); for (const l of f) vagas.push({ i, j, l, beco: f.length === 3 }); }
  r.embaralha(vagas); vagas.sort((a, b) => b.beco - a.beco);
  // a função do elemento não saiu em nenhuma sala deste layout (salas pequenas para a área mínima, poucas salas): ele vira
  // genérico em vez de sumir; quando a função existe, só entra nela
  const naSala = (e, s) => !e.comodos?.length || !e.comodos.some(c => salas.tem.has(c)) || (s >= 0 && salas.f[s] != null && e.comodos.includes(salas.f[s]));
  for (const e of sacola(P, els, k)) {
    if (e.w > c - .3 || e.d > c * .62) { // grande
      let cs = centros || Array.from({ length: 30 }, () => { let i, j, t = 0; do { i = r.int(0, g.cols - 1); j = r.int(0, g.rows - 1); } while (!dentro(i, j) && ++t < 30); return [CX(P, i), CZ(P, j)]; });
      if (salas) cs = centros ? cs.filter((_, n) => naSala(e, n)) : cs.filter(([x, z]) => naSala(e, salas.de(Math.floor((x + P.W / 2) / c), Math.floor((z + P.D / 2) / c))));
      if (!cs.length) continue;
      P.tentar(e, 30, () => { const [x, z] = r.um(cs); return [x + r.gauss() * .3, z + r.gauss() * .3, r.int(0, 3) * 90]; }, .3); continue;
    }
    const ok = []; vagas.forEach((v, n) => { if (!salas || naSala(e, salas.de(v.i, v.j))) ok.push(n); });
    for (let t = 0; t < 40 && ok.length; t++) {
      const idx = t < 8 ? ok[t % ok.length] : ok[r.int(0, ok.length - 1)], v = vagas[idx], m = c / 2 - e.d / 2 - P.esp / 2 - .14, rot = [0, 270, 180, 90][v.l];
      const off = e.w < c - 1 ? r.entre(-1, 1) * (c / 2 - e.w / 2 - .25) : 0, [dx, dz] = [[0, -m], [m, 0], [0, m], [-m, 0]][v.l], [tx, tz] = v.l % 2 ? [0, off] : [off, 0];
      if (P.por(e, CX(P, v.i) + dx + tx, CZ(P, v.j) + dz + tz, rot, 1, .08)) { vagas.splice(idx, 1); break; }
    }
  }
}
function bsp(P, g, max, r) {
  const salas = [], div = (i0, j0, i1, j1, p) => { const w = i1 - i0, h = j1 - j0;
    if ((w <= max && h <= max) || p > 7 || (p > 1 && r() < .1) || (w < 2 && h < 2)) { salas.push([i0, j0, i1, j1]); return; }
    if (w >= h && w > 1) { const c = r.int(i0 + 1, i1 - 1); div(i0, j0, c, j1, p + 1); div(c, j0, i1, j1, p + 1); } else { const c = r.int(j0 + 1, j1 - 1); div(i0, j0, i1, c, p + 1); div(i0, c, i1, j1, p + 1); } };
  div(0, 0, g.cols, g.rows, 0); const mapa = mapaVazio(g);
  salas.forEach(([i0, j0, i1, j1], s) => { for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) mapa[i][j] = s; });
  return { salas, mapa };
}
const centrosSalas = (P, salas) => salas.map(([i0, j0, i1, j1]) => [-P.W / 2 + (i0 + i1) / 2 * P.cel, -P.D / 2 + (j0 + j1) / 2 * P.cel]);
function porMapa(P, g, mapa, els, o = {}) { // regiões + portas + paredes + mobília (salas, pátio, celas, enfilada…)
  const ab = vazio(g), dentro = (i, j) => mapa[i][j] >= 0; abrirIguais(ab, g, mapa); portas(P, g, ab, mapa, o); inicioEm(P, g, dentro); erguer(P, g, ab, dentro);
  for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) if (!dentro(i, j)) macico(P, i, j);
  let salas = o.salas;
  if (!salas && o.prog != null && P.prog) { // com o programa, as regiões a partir de o.prog (0 = corredor/pátio fica de fora) são salas
    const ids = [...new Set(mapa.flat())].filter(v => v >= o.prog).sort((a, b) => a - b), idx = Object.fromEntries(ids.map((v, n) => [v, n])), rs = ids.map(() => [1e9, 1e9, -1, -1]);
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { const n = idx[mapa[i][j]]; if (n === undefined) continue; const q = rs[n]; q[0] = Math.min(q[0], i); q[1] = Math.min(q[1], j); q[2] = Math.max(q[2], i + 1); q[3] = Math.max(q[3], j + 1); }
    salas = comFuncoes(P, rs, (i, j) => idx[mapa[i][j]] ?? -1); }
  mobiliar(P, g, ab, els, { k: o.k ?? .9, dentro, centros: o.centros, salas });
  return ab;
}
function macico(P, i, j) { P.reservar(CX(P, i), CZ(P, j), P.cel / 2, P.cel / 2); (P.macicos ||= []).push([CX(P, i), CZ(P, j), P.cel / 2]); } // célula fechada (não se anda nela)
function caminhoDeCelulas(P, g, ordem, els, k = .9) { // um corredor que segue a ordem de células dada
  const mapa = mapaVazio(g, -1), ab = vazio(g); ordem.forEach(([i, j]) => mapa[i][j] = 0);
  for (let n = 0; n < ordem.length - 1; n++) { const [a, b] = ordem[n], [c, d] = ordem[n + 1], l = DIR.findIndex(([x, y]) => x === c - a && y === d - b); if (l >= 0) abrir(ab, g, a, b, l); }
  const dentro = (i, j) => mapa[i][j] === 0; P.inicio = [CX(P, ordem[0][0]), CZ(P, ordem[0][1])]; erguer(P, g, ab, dentro);
  for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) if (!dentro(i, j)) macico(P, i, j);
  mobiliar(P, g, ab, els, { k, dentro });
}
function labirinto(P, g, r, atalhos) {
  const ab = vazio(g), visto = new Set(), pilha = [[r.int(0, g.cols - 1), r.int(0, g.rows - 1)]]; visto.add(pilha[0].join());
  while (pilha.length) { const [i, j] = pilha[pilha.length - 1], viz = [0, 1, 2, 3].map(l => [l, i + DIR[l][0], j + DIR[l][1]]).filter(([, a, b]) => a >= 0 && b >= 0 && a < g.cols && b < g.rows && !visto.has(a + ',' + b));
    if (!viz.length) { pilha.pop(); continue; } const [l, a, b] = r.um(viz); abrir(ab, g, i, j, l); visto.add(a + ',' + b); pilha.push([a, b]); }
  for (let k = 0; k < Math.round(g.cols * g.rows * atalhos); k++) abrir(ab, g, r.int(0, g.cols - 1), r.int(0, g.rows - 1), r.int(0, 3));
  return ab;
}

// ------------------------------------------------------------------------------------------------ diretrizes do nível
// o ambiente de cada estilo: interno (salas, corredores…), externo (jardim, praça, campo, estrada…); os outros são neutros
// e seguem o ambiente do nível. Um elemento externo (árvore, fonte, poste) nunca nasce num estilo interno, e vice-versa.
export const AMB_ESTILO = {
  labirinto: 'interno', labirinto_largo: 'interno',
  corredores: 'interno', salas: 'interno', corredor_unico: 'interno', espinha: 'interno', anel: 'interno', celas: 'interno', cubiculos: 'interno',
  enfilada: 'interno', hipostilo: 'interno', auditorio: 'interno', escritorio_infinito: 'interno', arquivo_morto: 'interno', corredores_concreto: 'interno',
  clareira: 'externo', trilha: 'externo', rio: 'externo', floresta: 'externo', quarteiroes: 'externo', jardim_labirinto: 'externo', praca: 'externo',
  campo: 'externo', espelhos: 'externo', canal: 'externo', estrada: 'externo',
};
const cabeAmb = (e, amb) => amb === 'misto' || !e.amb || e.amb === 'ambos' || e.amb === amb;
// uma função (cômodo das diretrizes) por sala, pelo peso, com área mínima; a mesma função perde força a cada uso (variedade)
// salas: [[i0, j0, i1, j1]]; de(i, j): sala da célula. Sem funções, nada muda (todas as salas aceitam tudo)
function comFuncoes(P, salas, de) {
  // com o programa do nível, sala é de ambiente interno com arranjo (corredor e área externa ficam para as zonas)
  const F = (P.funcoes || []).filter(f => f.peso > 0 && (!P.prog || (f.amb !== 'externo' && !f.circ && f.arranjo))); if (!F.length) return null;
  const uso = F.map(() => 0), r = P.r;
  const f = salas.map(([i0, j0, i1, j1]) => { const a = (i1 - i0) * (j1 - j0) * P.cel * P.cel, ns = F.map((x, k) => (a >= (x.min || 0) && !(x.max && a > x.max * 1.5) ? x.peso / (P.tema ? 1 : 1 + uso[k]) : 0)), tot = ns.reduce((u, v) => u + v, 0);
    if (!tot) return null; let q = r() * tot, k = 0; while (k < ns.length - 1 && (q -= ns[k]) > 0) k++; while (!ns[k] && k < ns.length - 1) k++; uso[k]++; return F[k].id; });
  P.salasSemanticas = salas.map(([i0, j0, i1, j1], n) => ({ x0: -P.W / 2 + i0 * P.cel, z0: -P.D / 2 + j0 * P.cel, x1: -P.W / 2 + i1 * P.cel, z1: -P.D / 2 + j1 * P.cel, funcao: f[n] || 'vazio' }));
  return { de, f, tem: new Set(f.filter(x => x != null)), rects: salas };
}

// ------------------------------------------------------------------------------------------------ ambientes (programa do nível)
// Com o programa (web/diretrizes.js), cada sala se monta pelo ARRANJO do seu ambiente, só com os elementos dele e cada
// um no seu papel (principal, acompanha, parede, canto, solto) — como o RoomBuilder do jogo monta escritório, copa,
// arquivo, sala de estar... Os estilos sem salas viram UMA função para a zona inteira. Porte em ForjaLayout.gd.
export const SALAS_ESTILO = new Set(['salas', 'escritorio_infinito', 'arquivo_morto', 'corredores_concreto', 'espinha', 'anel', 'patio', 'celas', 'enfilada']);
const CORREDOR_ESTILO = new Set(['corredores', 'labirinto', 'labirinto_largo', 'corredor_unico', 'espiral_muros', 'quarteiroes']);
const DENS_ZONA = { vazio: .12, revirado: .6, corredor: .45, celula: .4, deposito: 1.1 };
const sc = (v) => Math.round(v * 1e9) / 1e9; // seno/cosseno sem o resto de ponto flutuante (cos 90° = 6e-17), igual nos dois lados
function funcaoDaZona(P, estilo, amb) {
  const A = P.W * P.D, cor = CORREDOR_ESTILO.has(estilo);
  const F = P.funcoes.filter(f => f.peso > 0 && f.els && (amb === 'misto' || (f.amb || 'interno') === amb)); if (!F.length) return null;
  const ns = F.map(f => f.peso * (f.circ ? (cor ? 4 : .3) : (cor ? .5 : 1)) * (f.max && f.max < A ? .15 : 1));
  let q = P.r() * ns.reduce((s, v) => s + v, 0), k = 0; while (k < ns.length - 1 && (q -= ns[k]) > 0) k++;
  return F[k];
}
// um elemento sorteado pelo peso (quantidade)
function qual(P, L) { if (L.length === 1) return L[0]; let t = 0; for (const e of L) t += Math.max(.01, e.qtd); let q = P.r() * t; for (const e of L) { q -= Math.max(.01, e.qtd); if (q <= 0) return e; } return L[L.length - 1]; }
function maiorDe(L) { let m = null; for (const e of L) if (!m || e.w * e.d > m.w * m.d) m = e; return m; }
function menorDe(L) { let m = null; for (const e of L) if (!m || e.w * e.d < m.w * m.d) m = e; return m; }
// a sala em metros (por dentro das paredes) e quem é dela
function salaS(P, [i0, j0, i1, j1], de, n) { const m = P.esp / 2 + .08, x0 = -P.W / 2 + i0 * P.cel + m, z0 = -P.D / 2 + j0 * P.cel + m, x1 = -P.W / 2 + i1 * P.cel - m, z1 = -P.D / 2 + j1 * P.cel - m;
  return { i0, j0, i1, j1, x0, z0, x1, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, de, n }; }
function pS(P, S, e, x, z, rot, folga = .1, esc = 1) {
  const [hx, hz] = meia(e.w * esc, e.d * esc, rot); if (x - hx < S.x0 || x + hx > S.x1 || z - hz < S.z0 || z + hz > S.z1) return false;
  if (S.de(Math.floor((x + P.W / 2) / P.cel), Math.floor((z + P.D / 2) / P.cel)) !== S.n) return false;
  return P.por(e, x, z, rot, esc, folga, P.conj || ++P.nconj);
}
// encostado na parede (0 norte, 1 leste, 2 sul, 3 oeste), virado para dentro; u = a posição ao longo dela
function encosta(P, S, e, lado, u, folga = .06) { const rot = [0, 270, 180, 90][lado], m = e.d / 2 + .02;
  return pS(P, S, e, lado === 1 ? S.x1 - m : lado === 3 ? S.x0 + m : u, lado === 0 ? S.z0 + m : lado === 2 ? S.z1 - m : u, rot, folga); }
function aoLongo(P, S, L, lados, { vao = .15, cap = 99, pula = 0 } = {}) {
  let n = 0; if (!L.length) return 0; const g0 = P.junto();
  for (const lado of lados) { const comp = lado % 2 ? S.d : S.w, ini = lado % 2 ? S.z0 : S.x0; let u = ini;
    while (n < cap) { const e = qual(P, L); if (u + e.w > ini + comp) break; const salta = pula > 0 && P.r() < pula; if (!salta && encosta(P, S, e, lado, u + e.w / 2)) n++; u += e.w + vao; } }
  P.solto(g0); return n;
}
function cantos(P, S, L, cap) { if (!L.length) return; let n = 0;
  for (const [x, z, sx, sz] of [[S.x0, S.z0, 1, 1], [S.x1, S.z0, -1, 1], [S.x1, S.z1, -1, -1], [S.x0, S.z1, 1, -1]]) { if (n >= cap) break; const e = qual(P, L), h = Math.max(e.w, e.d) / 2 + .05; if (pS(P, S, e, x + sx * h, z + sz * h, 0, .05)) n++; } }
function soltos(P, S, L, n) { if (!L.length) return; for (let q = 0; q < n; q++) { const e = qual(P, L); for (let t = 0; t < 15; t++) if (pS(P, S, e, P.r.entre(S.x0, S.x1), P.r.entre(S.z0, S.z1), P.r.int(0, 3) * 90, .15)) break; } }
function naFrente(P, S, a, x, z, rot, dist) { const ar = rad(rot); return pS(P, S, a, x + sc(Math.sin(ar)) * dist, z + sc(Math.cos(ar)) * dist, rot + 180, .02); }
const todosG = (G) => [...G.p, ...G.a, ...G.w, ...G.c, ...G.s];
const capD = (P, n) => Math.round(n * Math.min(1.6, P.o.densidade));
export const ARRANJOS = {
  fileiras(P, S, G) { const L = G.P; if (!L.length) return; const e0 = maiorDe(L), ad = G.a.length ? Math.max(...G.a.map(x => x.d)) : 0;
    const pw = e0.w + .25, faixa = 2 * e0.d + 2 * (ad ? ad + .4 : .5) + 1, cols = Math.floor((S.w - .6) / pw), rows = Math.floor(S.d / faixa);
    if (cols >= 1 && rows >= 1) { const x0 = S.cx - cols * pw / 2 + pw / 2, g0 = P.junto();
      for (let k = 0; k < rows; k++) { const zc = S.z0 + (k + .5) * S.d / rows;
        for (let m = 0; m < cols; m++) for (const s of [-1, 1]) { if (P.r() < .1) continue; const e = qual(P, L), x = x0 + m * pw, z = zc + s * (e.d / 2 + .03), rot = s < 0 ? 180 : 0;
          if (pS(P, S, e, x, z, rot, .02) && G.a.length) { const c = qual(P, G.a); naFrente(P, S, c, x, z, rot, e.d / 2 + c.d / 2 + .2); } } }
      P.solto(g0); }
    else aoLongo(P, S, L, [0, 2], { cap: 3 });
    aoLongo(P, S, G.fb === 'w' ? [] : G.w, [1, 3], { pula: .4 }); cantos(P, S, G.c, 2); },
  ilha(P, S, G) { const L = G.P; if (!L.length) return; const e = maiorDe(L), rot = S.w >= S.d ? 0 : 90, g0 = P.junto();
    if (pS(P, S, e, S.cx, S.cz, rot, .1) && G.a.length && G.fb !== 'a') { const [hx, hz] = meia(e.w, e.d, rot), c = qual(P, G.a), g = c.d / 2 + .22, n = Math.floor(2 * hx / (c.w + .25));
      for (const s of [-1, 1]) { for (let q = 0; q < n; q++) pS(P, S, c, S.cx - hx + (q + .5) * 2 * hx / n, S.cz + s * (hz + g), s < 0 ? 0 : 180, .02);
        pS(P, S, c, S.cx + s * (hx + g), S.cz, s < 0 ? 90 : 270, .02); } }
    P.solto(g0); aoLongo(P, S, G.fb === 'w' ? [] : G.w, [0, 1, 3], { pula: .3 }); cantos(P, S, G.c, 3); soltos(P, S, G.s, 2); },
  redondas(P, S, G) { const L = G.P; if (!L.length) return; const e = maiorDe(L), c = G.a.length && G.fb !== 'a' ? qual(P, G.a) : null;
    const R = Math.max(e.w, e.d) / 2 + (c ? c.d / 2 + .3 : 0), passo = 2 * R + (c ? c.d : 0) + .9, nx = Math.max(1, Math.floor(S.w / passo)), nz = Math.max(1, Math.floor(S.d / passo));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = S.x0 + (i + .5) * S.w / nx, z = S.z0 + (j + .5) * S.d / nz, t = qual(P, L), g0 = P.junto();
      if (!pS(P, S, t, x, z, P.r.int(0, 1) * 90, .1) || !c) { P.solto(g0); continue; }
      const n = P.r.int(2, 4), a0 = P.r() * 6.283;
      for (let m = 0; m < n; m++) { const an = a0 + m * 2 * Math.PI / n, px = x + sc(Math.cos(an)) * R, pz = z + sc(Math.sin(an)) * R; pS(P, S, c, px, pz, virado(px, pz, x, z), .02); }
      P.solto(g0); }
    aoLongo(P, S, G.fb === 'w' ? [] : G.w, [0], {}); cantos(P, S, G.c, 2); },
  perimetro(P, S, G) { let L = [...G.p, ...G.w]; if (!L.length) L = G.P; if (!L.length) return;
    aoLongo(P, S, L, P.r.embaralha([0, 1, 2, 3]), { vao: .08, pula: .15 });
    if (S.w > 5 && S.d > 5 && G.p.length) { const e = maiorDe(G.p), n = Math.floor((S.w - 3) / (e.w + .1)), g0 = P.junto(); for (let m = 0; m < n; m++) pS(P, S, qual(P, G.p), S.cx + (m - (n - 1) / 2) * (e.w + .1), S.cz, P.r() < .5 ? 0 : 180, .02); P.solto(g0); }
    if (G.fb !== 'a') soltos(P, S, G.a, 2); cantos(P, S, G.c, 2); },
  estantes(P, S, G) { let L = [...G.p, ...G.w]; if (!L.length) L = G.P; if (!L.length) return; const e = maiorDe(L), passo = e.d + 1.3, n = Math.max(1, Math.floor((S.d - .6) / passo));
    for (let k = 0; k < n; k++) { const z = S.z0 + .3 + (k + .5) * (S.d - .6) / n, g0 = P.junto(); let x = S.x0 + .5, m = 0;
      for (;;) { const t = qual(P, L); if (x + t.w > S.x1 - .5) break; if (m % 3 !== 2) pS(P, S, t, x + t.w / 2, z, k % 2 ? 180 : 0, .02); x += t.w + .06; m++; }
      P.solto(g0); }
    soltos(P, S, G.s, 2); },
  estar(P, S, G) { const L = G.P; if (!L.length) return; const centro = G.s.length ? qual(P, G.s) : G.p.length > 1 ? menorDe(G.p) : null, sofa = maiorDe(L);
    const g0 = P.junto(); if (centro) pS(P, S, centro, S.cx, S.cz, 0, .15);
    const R = 1.1 + sofa.d / 2 + (centro ? Math.max(centro.w, centro.d) / 2 : .3), lado = G.a.length ? G.a : L;
    pS(P, S, qual(P, L), S.cx, S.cz - R, 0, .05); pS(P, S, qual(P, lado), S.cx - R, S.cz, 90, .05); pS(P, S, qual(P, lado), S.cx + R, S.cz, 270, .05); P.solto(g0);
    aoLongo(P, S, G.fb === 'w' ? [] : G.w, [2], { pula: .3 }); cantos(P, S, G.c, 4); },
  roda(P, S, G) { const L = G.a.length ? G.a : G.P; if (!L.length) return; const e = qual(P, L), R = Math.min(S.w, S.d) / 2 - Math.max(e.w, e.d) / 2 - .3; if (R < .8) return;
    const n = Math.max(3, Math.min(14, Math.floor(2 * Math.PI * R / (e.w + .45)))), g0 = P.junto();
    for (let m = 0; m < n; m++) { const an = m * 2 * Math.PI / n, x = S.cx + sc(Math.cos(an)) * R, z = S.cz + sc(Math.sin(an)) * R; pS(P, S, e, x, z, virado(x, z, S.cx, S.cz), .02); }
    if (G.a.length && G.p.length && P.r() < .5) pS(P, S, qual(P, G.p), S.cx, S.cz, 0, .1); P.solto(g0); },
  vazio(P, S, G) { const T = todosG(G); if (!T.length) return; const k = P.r();
    if (k < .45) { const e = qual(P, T); for (let t = 0; t < 20; t++) if (pS(P, S, e, P.r.entre(S.x0, S.x1), P.r.entre(S.z0, S.z1), P.r.entre(0, 360), .2)) break; }
    else if (k < .6) cantos(P, S, G.c, 1); },
  deposito(P, S, G) { const T = todosG(G); if (!T.length) return; const nc = P.r.int(1, 2), cs = P.r.embaralha([[S.x0, S.z0, 1, 1], [S.x1, S.z0, -1, 1], [S.x1, S.z1, -1, -1], [S.x0, S.z1, 1, -1]]).slice(0, nc);
    const cap = capD(P, Math.min(18, S.w * S.d / 3)), g0 = P.junto();
    for (let q = 0; q < cap; q++) { const e = qual(P, T), [cx, cz, sx, sz] = cs[q % nc];
      for (let t = 0; t < 12; t++) { const x = cx + sx * Math.abs(P.r.gauss()) * 1.4 * (1 + t * .15), z = cz + sz * Math.abs(P.r.gauss()) * 1.4 * (1 + t * .15); if (pS(P, S, e, x, z, P.r.int(0, 3) * 90 + P.r.gauss() * 6, .02)) break; } } P.solto(g0); },
  revirado(P, S, G) { const T = todosG(G); if (!T.length) return; const cap = capD(P, Math.min(10, S.w * S.d / 6));
    for (let q = 0; q < cap; q++) { const e = qual(P, T); for (let t = 0; t < 15; t++) if (pS(P, S, e, P.r.entre(S.x0, S.x1), P.r.entre(S.z0, S.z1), P.r.entre(0, 360), .15, P.r.entre(.9, 1.1))) break; } },
  parede_unica(P, S, G) { let L = G.fb === 'a' ? G.a : [...G.p, ...G.w]; if (!L.length) L = G.P; if (!L.length) return; const lado = S.w >= S.d ? 0 : 3;
    aoLongo(P, S, L, [lado], { vao: .02 });
    if (G.a.length && G.fb !== 'a') pS(P, S, qual(P, G.a), S.cx, S.cz, lado === 0 ? 180 : 270, .1);
    cantos(P, S, G.c, 1); },
  recepcao(P, S, G) { const L = G.P; if (!L.length) return; const b = maiorDe(L), z = S.z0 + S.d * .35;
    const g0 = P.junto(); if (pS(P, S, b, S.cx, z, 0, .1) && G.a.length && G.fb !== 'a') { const c = qual(P, G.a); pS(P, S, c, S.cx, z - b.d / 2 - c.d / 2 - .3, 0, .02); P.solto(g0); aoLongo(P, S, G.a, [2], { vao: .35, cap: 6 }); } else P.solto(g0);
    cantos(P, S, G.c, 2); aoLongo(P, S, G.fb === 'w' ? [] : G.w, [1, 3], { pula: .5 }); },
  pilares(P, S, G) { const L = G.P; if (!L.length) return; const e = maiorDe(L), passo = Math.max(e.w, e.d) + 1.4, nx = Math.max(1, Math.floor(S.w / passo)), nz = Math.max(1, Math.floor(S.d / passo));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) pS(P, S, qual(P, L), S.x0 + (i + .5) * S.w / nx, S.z0 + (j + .5) * S.d / nz, 0, .1);
    soltos(P, S, G.s, 3); cantos(P, S, G.c, 2); },
  altar(P, S, G) { const L = G.P; if (!L.length) return; const f = maiorDe(L), z = S.z0 + f.d / 2 + .3, g0 = P.junto(); pS(P, S, f, S.cx, z, 0, .2);
    const B = G.a.length && G.fb !== 'a' ? G.a : G.s.length ? G.s : L, z0 = z + f.d / 2 + 1.6, n = Math.floor((S.z1 - .8 - z0) / 1.5) + 1;
    for (let k = 0; k < n; k++) for (const s of [-1, 1]) { const e = qual(P, B); pS(P, S, e, S.cx + s * (1.1 + e.w / 2), z0 + k * 1.5, 180, .05); }
    P.solto(g0); cantos(P, S, G.c, 2); },
  plateia(P, S, G) { const L = G.P; if (!L.length) return; const f = maiorDe(L), z = S.z0 + f.d / 2 + .4, g0 = P.junto(); pS(P, S, f, S.cx, z, 0, .2);
    const B = G.a.length && G.fb !== 'a' ? G.a : G.s.length ? G.s : L, e = qual(P, B), pw = e.w + .15, n = Math.floor((S.w - 1.2) / pw), z0 = z + f.d / 2 + 1.4, nr = Math.floor((S.z1 - .4 - z0) / (e.d + .7));
    for (let k = 0; k < nr; k++) for (let m = 0; m < n; m++) { if (n > 4 && m === Math.floor(n / 2)) continue; pS(P, S, e, S.x0 + .6 + (m + .5) * pw, z0 + k * (e.d + .7) + e.d / 2, 180, .02); }
    P.solto(g0); aoLongo(P, S, G.fb === 'w' ? [] : G.w, [1, 3], { pula: .5 }); cantos(P, S, G.c, 2); },
  bancada(P, S, G) { let L = [...G.p, ...G.w]; if (!L.length) L = G.P; if (!L.length) return;
    aoLongo(P, S, L, P.r.embaralha([0, 1, 3]).slice(0, P.r.int(2, 3)), { vao: .02 });
    if (S.w > 4.5 && S.d > 4.5 && G.p.length) { const e = maiorDe(G.p), rot = S.w >= S.d ? 0 : 90, g0 = P.junto(); if (pS(P, S, e, S.cx, S.cz + .4, rot, .1) && G.a.length && G.fb !== 'a') { const c = qual(P, G.a); naFrente(P, S, c, S.cx, S.cz + .4, rot, e.d / 2 + c.d / 2 + .25); } P.solto(g0); }
    cantos(P, S, G.c, 1); },
  celula(P, S, G) { const L = G.P; if (!L.length) return; const lado = P.r.int(0, 3), e = maiorDe(L); encosta(P, S, e, lado, lado % 2 ? S.cz : S.cx);
    if (G.w.length && G.fb !== 'w') encosta(P, S, qual(P, G.w), (lado + 2) % 4, lado % 2 ? S.cz + P.r.entre(-.3, .3) * S.d : S.cx + P.r.entre(-.3, .3) * S.w);
    if (G.fb !== 'a') soltos(P, S, G.a, 1); soltos(P, S, G.s, 1); cantos(P, S, G.c, 1); },
  corredor(P, S, G) { const L = [...G.w, ...G.c]; aoLongo(P, S, L.length ? L : G.P, [0, 1, 2, 3], { pula: .6 }); },
};
// os elementos da sala por papel; G.P = o principal (ou, sem principal, o primeiro grupo que houver: G.fb diz qual)
function grupos(E, f) { const G = { p: [], a: [], w: [], c: [], s: [] }, k = { principal: 'p', acompanha: 'a', parede: 'w', canto: 'c', solto: 's' };
  for (const e of E) { const p = f.els[e.id]; if (p !== undefined) G[k[p] || 'p'].push(e); }
  G.fb = G.p.length ? 'p' : G.w.length ? 'w' : G.a.length ? 'a' : G.s.length ? 's' : 'c'; G.P = G[G.fb]; return G; }
// as frentes das portas de uma sala ficam livres (a mobília não tapa a passagem)
function livrarPortas(P, g, ab, S) {
  for (let i = S.i0; i < S.i1; i++) for (let j = S.j0; j < S.j1; j++) { if (S.de(i, j) !== S.n) continue;
    for (let l = 0; l < 4; l++) { const a = i + DIR[l][0], b = j + DIR[l][1]; if (!ab[i][j][l] || a < 0 || b < 0 || a >= g.cols || b >= g.rows || S.de(a, b) === S.n) continue;
      P.reservar(CX(P, i) + DIR[l][0] * (P.cel / 2 - .7), CZ(P, j) + DIR[l][1] * (P.cel / 2 - .7), .75, .75, 0); } }
}
// as salas com função pelos arranjos; o que sobra (corredores, salas sem função) leva só o que não tem ambiente e o
// que é de circulação, sem acompanhantes soltos
function mobiliarProg(P, g, ab, E, { k = 1, dentro = () => true, salas }) {
  const F = Object.fromEntries(P.funcoes.map(f => [f.id, f])), Ss = salas.rects.map((q, n) => salaS(P, q, salas.de, n));
  for (const S of Ss) if (F[salas.f[S.n]]) livrarPortas(P, g, ab, S);
  for (const S of Ss) { const f = F[salas.f[S.n]]; if (f && ARRANJOS[f.arranjo]) ARRANJOS[f.arranjo](P, S, grupos(E, f)); }
  const circ = new Set(P.funcoes.filter(f => f.circ && f.els).flatMap(f => Object.keys(f.els)));
  const resto = E.filter(e => !e.acompanha && (circ.has(e.id) || !P.funcoes.some(f => f.els && e.id in f.els)));
  if (resto.length) mobiliar(P, g, ab, resto, { k: k * .5, dentro: (i, j) => dentro(i, j) && !(salas.de(i, j) >= 0 && F[salas.f[salas.de(i, j)]]) });
}
// acompanhantes: cada um nasce na frente de uma peça do líder (cadeira na mesa), virado para ela; se não cabe, atrás
function acompanhar(P, seg, vivos) {
  for (const b of seg) {
    const a = vivos.find(e => e.id === b.acompanha), n = sacola(P, [b], 1).length, lideres = P.inst.map((s, i) => [s, P.instG[i]]).filter(([s]) => s.elemento === a.id); let feitos = 0;
    for (const [s, g] of lideres) { if (feitos >= n) break;
      const ar = s.rot * Math.PI / 180, fx = Math.sin(ar), fz = Math.cos(ar), dist = a.d * (s.escala || 1) / 2 + b.d / 2 + .28;
      for (const [ux, uz, gira] of [[fx, fz, 180], [-fx, -fz, 0]]) if (P.por(b, s.x + ux * dist, s.z + uz * dist, s.rot + gira, 1, .02, g)) { feitos++; break; } }
  }
}

// ------------------------------------------------------------------------------------------------ conjuntos (= ForjaLayout.gd conjuntos)
// Cada peça que é âncora de um conjunto (o.kits, de diretrizes.js kitsDe) ganha os seus membros em volta: cadeira na
// frente, monitor sobre o tampo, criado-mudo ao lado, cadeiras em volta da mesa de reunião… O que já está lá (a cadeira
// que o arranjo pôs) não se repete. Sala revirada ou estilo caótico: o conjunto desmancha perto da âncora (torto, o que
// era de cima no chão). Sala vazia ou depósito: nada.
function arranjoEm(P, x, z) { for (const S of P.salasSemanticas || []) if (x >= S.x0 && x <= S.x1 && z >= S.z0 && z <= S.z1) { const f = P.funcoes.find(f => f.id === S.funcao); return f ? f.arranjo || '' : ''; } return ''; }
function jaTem(P, ids, x, z, raio) { for (const t of P.inst) if (ids.includes(t.elemento) && Math.abs(t.x - x) < raio && Math.abs(t.z - z) < raio) return true; return false; }
export function conjuntos(P, kits, base, caotico) {
  if (!kits) return; const porId = {}; for (const e of base) porId[e.id] = e; const n0 = P.inst.length;
  for (let k = 0; k < n0; k++) {
    const s = P.inst[k], K = kits[s.elemento], a = porId[s.elemento], cg = P.instG[k]; if (!K || !a || s.y) continue;
    const arr = arranjoEm(P, s.x, s.z); if (arr === 'vazio' || arr === 'deposito') continue;
    const torto = caotico || arr === 'revirado', esc = s.escala || 1, ar = rad(s.rot), fx = sc(Math.sin(ar)), fz = sc(Math.cos(ar)), lx = fz, lz = -fx;
    const aw = a.w * esc, ad = a.d * esc, ah = (a.h || 1) * esc;
    for (const m of K.m) {
      const L = m.e.filter(id => porId[id]).map(id => porId[id]); if (!L.length) continue;
      if (m.ch < 1 && P.r() >= m.ch) continue;
      const b = qual(P, L), pos = [];
      if (m.onde === 'sobre' || m.onde === 'acima') {
        const y = m.onde === 'acima' ? ah + .1 : m.alt < 0 ? ah : Math.min(ah, m.alt);
        const u = m.onde === 'acima' ? 0 : (P.r() - .5) * Math.max(0, aw - b.w) * .8, v = m.fundo || m.onde === 'acima' ? -(ad / 2 - b.d / 2 - .03) : (P.r() - .5) * Math.max(0, ad - b.d) * .6;
        const x = s.x + lx * u + fx * v, z = s.z + lz * u + fz * v;
        if (torto) { const sg = P.r() < .5 ? 1 : -1, d = aw / 2 + b.w / 2 + .15; P.por(b, s.x + sg * lx * d + P.r.gauss() * .2, s.z + sg * lz * d + P.r.gauss() * .2, P.r.entre(0, 360), 1, .02, cg); continue; }
        if (!jaTem(P, m.e, x, z, .3)) P.sobre(b, x, z, s.rot, y);
        continue;
      }
      if (m.onde === 'frente' || m.onde === 'atras' || m.onde === 'longe') { const sg = m.onde === 'atras' ? -1 : 1, d = ad / 2 + b.d / 2 + (m.onde === 'longe' ? 1.6 : .2);
        pos.push([s.x + sg * fx * d, s.z + sg * fz * d, m.onde === 'atras' ? s.rot : s.rot + 180]); }
      else if (m.onde === 'lado') { const sg = P.r() < .5 ? 1 : -1, d = aw / 2 + b.w / 2 + .12; pos.push([s.x + sg * lx * d, s.z + sg * lz * d, s.rot]); }
      else if (m.onde === 'em_volta') { const hw = aw / 2, hd = ad / 2, g = b.d / 2 + .15, nl = Math.max(1, Math.floor(2 * hw / (b.w + .25)));
        for (const sg of [1, -1]) for (let q = 0; q < nl; q++) { const u = -hw + (q + .5) * 2 * hw / nl; pos.push([s.x + lx * u + sg * fx * (hd + g), s.z + lz * u + sg * fz * (hd + g), s.rot + (sg > 0 ? 180 : 0)]); }
        for (const sg of [1, -1]) pos.push([s.x + sg * lx * (hw + g), s.z + sg * lz * (hw + g), s.rot + (sg > 0 ? 270 : 90)]); }
      else if (m.onde === 'roda') { const R = Math.max(aw, ad) / 2 + b.d / 2 + .12, a0 = P.r() * 6.283;
        for (let q = 0; q < m.n; q++) { const an = a0 + q * 2 * Math.PI / m.n, x = s.x + sc(Math.cos(an)) * R, z = s.z + sc(Math.sin(an)) * R; pos.push([x, z, virado(x, z, s.x, s.z)]); } }
      let feitos = 0;
      for (const [x0, z0, r0] of pos) { if (feitos >= m.n) break;
        let x = x0, z = z0, rot = r0; if (torto) { x += P.r.gauss() * .35; z += P.r.gauss() * .35; rot += P.r.entre(-70, 70); }
        if (jaTem(P, m.e, x, z, .55)) { feitos++; continue; }
        if (P.por(b, x, z, rot, 1, .02, cg)) feitos++; }
    }
  }
}
// o que está em cima de outra peça (y > 0) só fica se a peça de baixo ainda está lá (o inspetor e a mistura tiram coisas)
export function apoiados(altos, chao, els) {
  const E = {}; for (const e of els) E[e.id] = e;
  return altos.filter(s => chao.some(t => { const e = E[t.elemento]; if (!e || t.y || t.elemento === s.elemento) return false;
    const a = rad(t.rot || 0), c = sc(Math.cos(a)), n = sc(Math.sin(a)), dx = s.x - t.x, dz = s.z - t.z, esc = t.escala || 1;
    return Math.abs(dx * c - dz * n) <= e.w * esc / 2 + .05 && Math.abs(dx * n + dz * c) <= e.d * esc / 2 + .05; }));
}

// ------------------------------------------------------------------------------------------------ o jeito dos níveis do jogo (O_Ultimo_Dia_Util/world)
// partição de salas do WorldGenerator._split: corta em ≥ 3 células se o lado tem ≥ 6; para cedo se a área ≤ 30 (40%);
// cada corte vira parede com uma porta de 1,2 m (+10% de portas extras); 8% dos cortes ficam abertos
function particao(P, g) {
  const r = P.r, salas = [], mapa = mapaVazio(g), vaos = [], cortes = [];
  const div = (x0, y0, w, h) => {
    const cv = w >= 6, ch = h >= 6;
    if ((!cv && !ch) || (w * h <= 30 && r() < .4)) { const s = salas.length; salas.push([x0, y0, x0 + w, y0 + h]); for (let i = x0; i < x0 + w; i++) for (let j = y0; j < y0 + h; j++) mapa[i][j] = s; return; }
    const vert = !cv ? false : !ch ? true : w > h ? r() < .8 : w < h ? r() < .2 : r() < .5;
    const len = vert ? w : h, c = 3 + Math.floor(r() * (len - 5)), span = vert ? h : w, porta = Math.floor(r() * span), aberto = r() < .08;
    for (let k = 0; k < span; k++) { const st = aberto ? 0 : (k === porta || r() < .1 ? 2 : 1); if (st === 0) cortes.push([vert, (vert ? x0 : y0) + c, (vert ? y0 : x0) + k]); else if (st === 2) vaos.push([vert, (vert ? x0 : y0) + c, (vert ? y0 : x0) + k]); }
    if (vert) { div(x0, y0, c, h); div(x0 + c, y0, w - c, h); } else { div(x0, y0, w, c); div(x0, y0 + c, w, h - c); }
  };
  div(0, 0, g.cols, g.rows);
  return { salas, mapa, vaos, cortes };
}
// abre a aresta [vertical?, linha, célula ao longo]: vertical = entre as colunas linha-1 e linha
function abrirAresta(ab, g, [vert, a, b]) { if (vert) abrir(ab, g, a - 1, b, 1); else abrir(ab, g, b, a - 1, 2); }
// vãos de porta de 1,2 m no meio dessas arestas
function cortarPortas(P, vaos) {
  for (const [vert, a, b] of vaos) { const fixo = vert ? -P.W / 2 + a * P.cel : -P.D / 2 + a * P.cel, u = vert ? CZ(P, b) : CX(P, b);
    P.paredes = cortarVao(P.paredes, vert ? 'x' : 'z', fixo, u - .6, u + .6); }
}
// salas da partição: paredes e portas; as portas contam como abertas para a mobília não tapá-las
function salasDoJogo(P, g) {
  const S = particao(P, g), ab = vazio(g); abrirIguais(ab, g, S.mapa);
  for (const c of S.cortes) abrirAresta(ab, g, c);
  inicioEm(P, g); erguer(P, g, ab); cortarPortas(P, S.vaos);
  for (const v of S.vaos) abrirAresta(ab, g, v);
  return { ...S, ab };
}
// o maior elemento (o primeiro, no empate): fonte, torre, monumento
function maior(E) { let m = null; for (const e of E) if (!m || e.w * e.d > m.w * m.d) m = e; return m; }
function marco(E, tipo) { return E.find(e => `${e.id} ${e.nome || ''}`.toLowerCase().includes(tipo)); }
// uma posição numa célula de 3 m, com tremido: campos, praças, espelhos
function naCelula(P, trem) { const cols = Math.max(1, Math.round(P.W / 3)), rows = Math.max(1, Math.round(P.D / 3)), r = P.r;
  return () => { const i = r.int(0, cols - 1), j = r.int(0, rows - 1); return [-P.W / 2 + (i + .5) * P.W / cols + r.entre(-trem, trem), -P.D / 2 + (j + .5) * P.D / rows + r.entre(-trem, trem)]; }; }

// ------------------------------------------------------------------------------------------------ os estilos (48 + os do jogo)
const L = (P) => Math.min(P.W, P.D);
export const ESTILOS = {
  // ---------------- abertos
  amplo: { f: 'abertos', nome: 'Amplo', desc: 'poucos objetos, muito espaço; peças grandes nas bordas', g(P, E) {
    const r = P.r; espalhar(P, E, { k: .45, folga: 2.6, pos: (e) => grande(e) || r() < .45 ? [r.entre(-.45, .45) * P.W, r.um([-1, 1]) * (P.D / 2 - e.d / 2 - r.entre(.8, 2.5))] : P.U(.42, -.45, .3), rot: (x, z, e) => grande(e) ? virado(x, z, 0, 0) : r.int(0, 7) * 45 }); } },
  clareira: { f: 'abertos', nome: 'Clareira', desc: 'cheio nas bordas, um vazio redondo no meio', g(P, E) {
    const R = L(P) * .26; espalhar(P, E, { k: 1.3, folga: .35, peso: (x, z) => Math.hypot(x, z) > R ? 1 : 0, rot: (x, z) => virado(x, z, 0, 0) + P.r.gauss() * 20 }); } },
  perimetro: { f: 'abertos', nome: 'Perímetro', desc: 'tudo junto das bordas; arena vazia no centro', g(P, E) {
    const r = P.r; espalhar(P, E, { k: .85, folga: .3, pos: (e, t) => { const lado = r.int(0, 3), q = r.entre(-.46, .46), m = .4 + e.d / 2 + (t > 40 ? r.entre(0, 2) : 0);
      return lado === 0 ? [q * P.W, -P.D / 2 + m] : lado === 1 ? [P.W / 2 - m, q * P.D] : lado === 2 ? [-P.W / 2 + m, q * P.D] : [q * P.W, P.D / 2 - m]; }, rot: (x, z) => Math.abs(x) / P.W > Math.abs(z) / P.D ? (x > 0 ? 270 : 90) : (z > 0 ? 180 : 0) }); } },
  dispersao: { f: 'abertos', nome: 'Dispersão', desc: 'espaçamento uniforme, sem amontoar (floresta rala)', g(P, E) { const n = Math.max(1, sacola(P, E, 1).length); espalhar(P, E, { k: 1, folga: Math.sqrt(P.W * P.D / n) * .45, tent: 120, rot: () => P.r.entre(0, 360) }); } },
  quadrantes: { f: 'abertos', nome: 'Quadrantes', desc: 'quatro zonas com temas diferentes, cruz livre no meio', g(P, E) {
    const r = P.r, qs = [[-1, -1], [1, -1], [-1, 1], [1, 1]], tema = qs.map(() => r.embaralha([...E]).slice(0, Math.max(1, Math.ceil(E.length / 3))));
    P.reservar(0, 0, .9, P.D / 2, 0); P.reservar(0, 0, P.W / 2, .9, 0);
    for (const e of sacola(P, E, 1)) { const opc = qs.filter((_, i) => tema[i].includes(e)), [sx, sz] = r.um(opc.length ? opc : qs);
      P.tentar(e, 50, () => [sx * r.entre(1.4, P.W / 2 - .5), sz * r.entre(1.4, P.D / 2 - .5), r.int(0, 3) * 90], .35); } } },

  // ---------------- ordenados
  organizado: { f: 'ordenados', nome: 'Organizado', desc: 'fileiras alinhadas com corredores, mesma orientação', g(P, E) { fileiras(P, E, { corredor: P.o.densidade > 1.2 ? 1.3 : 1.9, alterna: P.r() < .5 }); } },
  grade: { f: 'ordenados', nome: 'Grade', desc: 'pontos regulares em grade (pilares, túmulos, vasos)', g(P, E) { fileiras(P, E, { k: 1.4, corredor: 1.6, vao: 1.6, rotFila: () => 0 }); } },
  xadrez: { f: 'ordenados', nome: 'Xadrez', desc: 'dois tipos alternados como tabuleiro', g(P, E) { fileiras(P, E, { k: 1.6, xadrez: true, corredor: 1.2, vao: 1.2 }); } },
  diagonal: { f: 'ordenados', nome: 'Diagonal', desc: 'fileiras a 45°, corredores em diagonal', g(P, E) { fileiras(P, E, { ang: P.r.um([45, -45, 30, -30]), corredor: 1.8 }); } },
  estacionamento: { f: 'ordenados', nome: 'Estacionamento', desc: 'fileiras duplas de costas, pistas largas entre elas', g(P, E) { fileiras(P, E, { k: 1.4, alterna: true, corredor: 3.2, vao: .5 }); } },
  avenida: { f: 'ordenados', nome: 'Avenida', desc: 'eixo central livre do início ao fundo, ladeado por fileiras', g(P, E) {
    const r = P.r, w = r.entre(2.4, 4); P.reservar(0, 0, w / 2, P.D / 2, .1);
    for (const e of sacola(P, E, 1.1)) { let ok = false; for (let z = -P.D / 2 + e.w / 2 + .4; z < P.D / 2 - 1 && !ok; z += e.w + .5) for (const s of [-1, 1]) { const x = s * (w / 2 + e.d / 2 + .3 + (grande(e) ? r.entre(0, 1.5) : 0)); if (P.por(e, x, z, s > 0 ? 270 : 90, 1, .15)) { ok = true; break; } }
      if (!ok) P.tentar(e, 30, () => [r.um([-1, 1]) * r.entre(w / 2 + 2, P.W / 2), r.entre(-.45, .45) * P.D, r.int(0, 3) * 90], .4); } } },
  simetrico: { f: 'ordenados', nome: 'Simétrico', desc: 'espelhado no eixo central, cerimonial', g(P, E) {
    const r = P.r, bag = sacola(P, E, .85), f = bag.shift(); if (f) P.por(f, 0, -P.D / 2 + f.d / 2 + 1, 0, 1, .5); const lin = r() < .5;
    for (const e of bag) for (let t = 0; t < 60; t++) { const x = -r.entre(1.3 + e.w / 2, P.W / 2 - e.w / 2 - .2), z = lin ? -P.D / 2 + 1.5 + Math.round(r.entre(0, (P.D - 5) / 3)) * 3 : r.entre(-.45, .3) * P.D, rot = lin ? 90 : r.int(0, 3) * 90, [hx, hz] = meia(e.w, e.d, rot);
      if (P.livre(x, z, hx, hz, .5) && P.livre(-x, z, hx, hz, .5)) { P.por(e, x, z, rot, 1, .5); P.por(e, -x, z, -rot, 1, .5); break; } } } },
  auditorio: { f: 'ordenados', nome: 'Auditório', desc: 'fileiras viradas para um palco no fundo, corredor no meio', g(P, E) {
    const [fx, fz] = focoNoFundo(P, E); P.reservar(0, 0, .8, P.D / 2, 0); fileiras(P, E.filter(e => !grande(e)).length ? E.filter(e => !grande(e)) : E, { k: 1.3, corredor: 1.1, vao: .25, rotFila: () => 180, regiao: (x, z) => z > fz + 2.5 }); } },
  anfiteatro: { f: 'ordenados', nome: 'Anfiteatro', desc: 'arcos concêntricos virados para um palco', g(P, E) { arcos(P, E, { centro: [0, -P.D / 2 + 1.5], a0: .15, a1: Math.PI - .15, r0: 3, gap: 1, k: 1.2 }); } },
  radial: { f: 'ordenados', nome: 'Radial', desc: 'peça principal no centro, anéis em volta', g(P, E) { arcos(P, E, { centro: [0, -P.D * .08], r0: 2.2, gap: 1.8 }); } },
  estrela: { f: 'ordenados', nome: 'Estrela', desc: 'raios saindo do centro, peças alinhadas a eles', g(P, E) {
    const r = P.r, n = r.int(4, 8), a0 = r.entre(0, 1), bag = sacola(P, E, 1.1), f = bag.shift(); if (f) P.por(f, 0, 0, 0, 1, .5);
    for (const e of bag) P.tentar(e, 40, (t) => { const a = a0 + r.int(0, n - 1) * 2 * Math.PI / n, d = r.entre(2.5, L(P) / 2 - 1); return [Math.cos(a) * d, Math.sin(a) * d, grau(-a) + 90]; }, .3); } },
  procissao: { f: 'ordenados', nome: 'Procissão', desc: 'uma fila única serpenteando do início ao fundo', g(P, E) {
    const pts = [], n = 4; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([Math.sin(t * Math.PI * n * .5 + P.r.entre(0, .2)) * P.W * .36, P.D / 2 - 3 - t * (P.D - 4)]); }
    margens(P, E, pts, { sobre: true, k: 1.5, folga: .25 }); } },

  // ---------------- orgânicos
  ilhas: { f: 'organicos', nome: 'Ilhas', desc: 'aglomerados com temas, separados por vazios', g(P, E) { aglomerados(P, E); } },
  trilha: { f: 'organicos', nome: 'Trilha', desc: 'caminho sinuoso do início ao fundo, objetos nas margens', g(P, E) {
    const r = P.r, pts = [[P.inicio[0], P.inicio[1]]], n = r.int(3, 5); for (let i = 1; i <= n; i++) pts.push([r.entre(-.32, .32) * P.W, P.D / 2 - 1 - (P.D - 2) * i / n]);
    P.trilha = pts; margens(P, E, pts, { largura: 1.8, dist: [.3, 1.8] }); } },
  rio: { f: 'organicos', nome: 'Rio', desc: 'uma faixa vazia atravessa o lugar; tudo se junta nas margens', g(P, E) {
    const r = P.r, pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([-P.W / 2 + t * P.W, (t - .5) * P.D * r.entre(-.5, .5) * 0 + Math.sin(t * 5 + r.entre(0, .01)) * P.D * .12 - P.D * .05]); }
    P.trilha = pts; margens(P, E, pts, { largura: r.entre(2.5, 4.5), dist: [.1, 2.5], k: 1.2 }); } },
  ondas: { f: 'organicos', nome: 'Ondas', desc: 'fileiras que ondulam como dunas', g(P, E) {
    const r = P.r, A = r.entre(1, 2.5), f = r.entre(.25, .5), bag = sacola(P, E, 1.2); let z = -P.D / 2 + 1, fila = 0;
    while (z < P.D / 2 - 2.5 && bag.length) { const e = bag[0], fase = fila * .8; for (let x = -P.W / 2 + e.w / 2 + .3; x < P.W / 2 - .3; x += e.w + .5) { const j = bag.indexOf(e); if (j < 0) break; const zz = z + Math.sin(x * f + fase) * A;
      if (P.por(e, x, zz, ao_longo(Math.atan2(Math.cos(x * f + fase) * A * f, 1)), 1, .12)) bag.splice(j, 1); } z += e.d + 2; fila++; if (bag[0] === e && !bag.slice(1).length) break; } } },
  espiral: { f: 'organicos', nome: 'Espiral', desc: 'objetos enrolados numa espiral até o centro', g(P, E) {
    const pts = [], R = L(P) / 2 - 1, voltas = P.r.entre(2, 3.2); for (let i = 0; i <= 160; i++) { const t = i / 160, a = t * voltas * 2 * Math.PI, rr = R * (1 - t * .9); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    margens(P, E, pts, { sobre: true, k: 1.4, folga: .2, passo: .2 }); } },
  floresta: { f: 'organicos', nome: 'Floresta', desc: 'denso, torto, escalas variadas, clareiras naturais', g(P, E) { const r = P.r, cl = [P.U(.3, -.3, .2), P.U(.3, -.3, .2)];
    espalhar(P, E, { k: 1.7, folga: .55, rot: () => r.entre(0, 360), esc: [.8, 1.25], peso: (x, z) => cl.every(([a, b]) => Math.hypot(x - a, z - b) > 2.5) ? 1 : .05 }); } },
  fractal: { f: 'organicos', nome: 'Fractal', desc: 'aglomerados de aglomerados', g(P, E) { const r = P.r, mae = aglomerados(P, [], { n: [2, 4] }), filhos = []; for (const [x, z] of mae) for (let k = 0; k < 3; k++) filhos.push([x + r.gauss() * 2.6, z + r.gauss() * 2.6]);
    aglomerados(P, E, { centros: filhos, raio: [.4, .9], folga: .15, k: 1.2 }); } },
  mosaico: { f: 'organicos', nome: 'Mosaico', desc: 'regiões vizinhas, cada uma de um tipo só', g(P, E) {
    const r = P.r, sem = []; E.forEach(e => { for (let k = 0; k < r.int(1, 2); k++) sem.push([...P.U(.4, -.42, .35), e]); });
    const de = (x, z) => sem.reduce((m, s) => (Math.hypot(x - s[0], z - s[1]) < Math.hypot(x - m[0], z - m[1]) ? s : m), sem[0]);
    P.mosaico = sem; espalhar(P, E, { k: 1.3, folga: .35, peso: (x, z, e) => de(x, z)[2] === e ? 1 : 0, tent: 140 }); } },

  // ---------------- arquitetura (paredes)
  corredores: { f: 'arquitetura', nome: 'Corredores', desc: 'rede de corredores; objetos encostados nas paredes', g(P, E) {
    const r = P.r, g = grade(P), m = mapaVazio(g, -1), meio = Math.floor(g.cols / 2) + r.int(-1, 1);
    for (let j = 0; j < g.rows; j++) m[meio][j] = 0; let j = r.int(0, 2);
    while (j < g.rows - 1) { const i0 = r() < .3 ? r.int(0, meio) : 0, i1 = r() < .3 ? r.int(meio, g.cols - 1) : g.cols - 1; for (let i = i0; i <= i1; i++) m[i][j] = 0; j += r.int(2, 4); }
    for (let k = 0; k < Math.round(g.cols / 3); k++) { const i = r.int(0, g.cols - 1), j0 = r.int(0, g.rows - 2); for (let jj = j0; jj < Math.min(g.rows, j0 + r.int(2, g.rows)); jj++) m[i][jj] = 0; }
    porMapa(P, g, m, E, {}); } },
  salas: { f: 'arquitetura', nome: 'Salas', desc: 'cômodos com portas; grandes no meio, o resto nas paredes', g(P, E) { const g = grade(P), { salas, mapa } = bsp(P, g, P.o.densidade > 1.2 ? 2 : 4, P.r); porMapa(P, g, mapa, E, { centros: centrosSalas(P, salas), salas: comFuncoes(P, salas, (i, j) => mapa[i][j]) }); } },
  labirinto: { f: 'arquitetura', nome: 'Labirinto', desc: 'labirinto com alguns atalhos; objetos nos becos', g(P, E) { const g = grade(P), ab = labirinto(P, g, P.r, .08); inicioEm(P, g); erguer(P, g, ab); mobiliar(P, g, ab, E, { k: .8 }); } },
  labirinto_largo: { f: 'arquitetura', nome: 'Labirinto largo', desc: 'caminhos de 6 m: cabem peças grandes', g(P, E) { const g = grade(P, 6), ab = labirinto(P, g, P.r, .15); inicioEm(P, g); erguer(P, g, ab); mobiliar(P, g, ab, E, { k: 1 }); } },
  corredor_unico: { f: 'arquitetura', nome: 'Corredor único', desc: 'um só corredor longo, indo e voltando', g(P, E) {
    const g = grade(P), ordem = []; for (let j = g.rows - 1, s = 0; j >= 0; j -= 2, s++) { const lin = [...Array(g.cols).keys()]; if (s % 2) lin.reverse(); lin.forEach(i => ordem.push([i, j])); if (j - 2 >= 0 || j - 1 >= 0) { const i = lin[lin.length - 1]; if (j - 1 >= 0) ordem.push([i, j - 1]); } }
    caminhoDeCelulas(P, g, ordem.filter(([, j]) => j >= 0), E); } },
  espinha: { f: 'arquitetura', nome: 'Espinha de peixe', desc: 'corredor central com ramos que acabam em saletas', g(P, E) {
    const r = P.r, g = grade(P), m = mapaVazio(g, -1), meio = Math.floor(g.cols / 2); let s = 1; for (let j = 0; j < g.rows; j++) m[meio][j] = 0;
    for (let j = 1; j < g.rows - 1; j += 2) for (const lado of [-1, 1]) { if (r() < .2) continue; const comp = r.int(1, Math.max(1, Math.floor(g.cols / 2) - 2)); for (let k = 1; k <= comp; k++) m[meio + lado * k][j] = 0;
      const fim = meio + lado * (comp + 1); if (fim >= 0 && fim < g.cols) { m[fim][j] = s; if (j + 1 < g.rows && m[fim][j + 1] < 0) m[fim][j + 1] = s; s++; } }
    porMapa(P, g, m, E, { extras: 0, prog: 1 }); } },
  anel: { f: 'arquitetura', nome: 'Anel', desc: 'corredor em volta de um bloco; uma sala no meio', g(P, E) {
    const g = grade(P), m = mapaVazio(g, -1); for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { const borda = i === 0 || j === 0 || i === g.cols - 1 || j === g.rows - 1, dentro = i >= 2 && j >= 2 && i <= g.cols - 3 && j <= g.rows - 3; if (borda) m[i][j] = 0; else if (dentro) m[i][j] = 1; }
    m[Math.floor(g.cols / 2)][1] = 0; porMapa(P, g, m, E, { extras: 0, centros: [[0, 0]], prog: 1 }); } },
  patio: { f: 'arquitetura', nome: 'Pátio', desc: 'salas em volta de um pátio aberto', g(P, E) {
    const r = P.r, g = grade(P), m = mapaVazio(g, 0); let s = 1; const band = (i, j) => i < 2 || j < 2 || i >= g.cols - 2 || j >= g.rows - 2;
    const volta = []; for (let i = 0; i < g.cols; i++) volta.push([i, 0]); for (let j = 1; j < g.rows; j++) volta.push([g.cols - 1, j]); for (let i = g.cols - 2; i >= 0; i--) volta.push([i, g.rows - 1]); for (let j = g.rows - 2; j > 0; j--) volta.push([0, j]);
    let n = 0, tam = r.int(2, 3); for (const [i, j] of volta) { if (n++ % tam === 0) s++; m[i][j] = s; const ii = i === 0 ? 1 : i === g.cols - 1 ? g.cols - 2 : i, jj = j === 0 ? 1 : j === g.rows - 1 ? g.rows - 2 : j; if (band(ii, jj)) m[ii][jj] = s; }
    porMapa(P, g, m, E, { hub: 0, centros: [[0, 0]], prog: 1 }); } },
  celas: { f: 'arquitetura', nome: 'Celas', desc: 'corredor com celas iguais dos dois lados', g(P, E) {
    const g = grade(P), m = mapaVazio(g, -1), meio = Math.floor(g.cols / 2); let s = 1; for (let j = 0; j < g.rows; j++) { m[meio][j] = 0; for (const lado of [-1, 1]) { for (let k = 1; k <= 2; k++) { const i = meio + lado * k; if (i >= 0 && i < g.cols) m[i][j] = s; } s++; } }
    porMapa(P, g, m, E, { hub: 0, prog: 1 }); } },
  cubiculos: { f: 'arquitetura', nome: 'Baias', desc: 'divisórias baixas de escritório, corredores entre as ilhas', g(P, E) {
    const g = grade(P), ab = vazio(g); P.alt = 1.3; P.esp = .08;
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { const tipo = j % 3; if (tipo === 2 || j === g.rows - 1) { if (i + 1 < g.cols) abrir(ab, g, i, j, 1); abrir(ab, g, i, j, 0); abrir(ab, g, i, j, 2); } }
    for (let i = 0; i < g.cols; i++) abrir(ab, g, i, 0, 0);
    inicioEm(P, g); erguer(P, g, ab); mobiliar(P, g, ab, E, { k: 1.2 }); } },
  quarteiroes: { f: 'arquitetura', nome: 'Quarteirões', desc: 'ruas entre blocos fechados; coisas nas calçadas', g(P, E) {
    const r = P.r, g = grade(P), m = mapaVazio(g, -1), pi = r.int(2, 3), pj = r.int(2, 3); for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) if (i % pi === 0 || j % pj === pj - 1 || j === g.rows - 1) m[i][j] = 0;
    porMapa(P, g, m, E, { k: 1 }); } },
  espiral_muros: { f: 'arquitetura', nome: 'Caracol', desc: 'corredor em espiral até o centro', g(P, E) {
    const g = grade(P), ordem = []; let [i0, j0, i1, j1] = [0, 0, g.cols - 1, g.rows - 1];
    while (i0 <= i1 && j0 <= j1) { for (let i = i0; i <= i1; i++) ordem.push([i, j1]); for (let j = j1 - 1; j >= j0; j--) ordem.push([i1, j]); if (j0 < j1) for (let i = i1 - 1; i >= i0; i--) ordem.push([i, j0]); if (i0 < i1) for (let j = j0 + 1; j < j1; j++) ordem.push([i0, j]); i0++; j0++; i1--; j1--; }
    caminhoDeCelulas(P, g, ordem, E); } },
  enfilada: { f: 'arquitetura', nome: 'Enfilada', desc: 'salas em sequência, cada uma só leva à próxima', g(P, E) {
    const g = grade(P), m = mapaVazio(g), cad = []; let s = 0; for (let j = g.rows - 1, lin = 0; j >= 0; j -= 2, lin++) { const cols = [...Array(Math.ceil(g.cols / 2)).keys()]; if (lin % 2) cols.reverse(); for (const c of cols) { for (const [a, b] of [[0, 0], [1, 0], [0, -1], [1, -1]]) { const i = c * 2 + a, jj = j + b; if (i < g.cols && jj >= 0) m[i][jj] = s; } cad.push(s++); } }
    porMapa(P, g, m, E, { cadeia: cad, prog: 0 }); } },
  hipostilo: { f: 'arquitetura', nome: 'Salão de colunas', desc: 'salão fechado, colunas em grade, objetos entre elas', g(P, E) {
    const r = P.r, c = r.um([3, 4.5]); P.parede(-P.W / 2, -P.D / 2, P.W / 2, -P.D / 2); P.parede(-P.W / 2, -P.D / 2, -P.W / 2, P.D / 2); P.parede(P.W / 2, -P.D / 2, P.W / 2, P.D / 2);
    P.parede(-P.W / 2, P.D / 2, -1.5, P.D / 2); P.parede(1.5, P.D / 2, P.W / 2, P.D / 2);
    for (let x = -P.W / 2 + c; x < P.W / 2 - .5; x += c) for (let z = -P.D / 2 + c; z < P.D / 2 - 1.5; z += c) if (Math.abs(x) > 1) P.pilar(x, z, .55);
    espalhar(P, E, { k: 1, folga: .4, pos: () => [Math.round(P.r.entre(-P.W / 2, P.W / 2) / c) * c + c / 2, Math.round(P.r.entre(-P.D / 2, P.D / 2) / c) * c + c / 2], rot: () => r.int(0, 3) * 90 }); } },

  // ---------------- cênicos
  altar: { f: 'cenicos', nome: 'Altar', desc: 'um objeto isolado no fundo, um caminho de peças até ele', g(P, E) {
    const [fx, fz] = focoNoFundo(P, E), resto = E.length > 1 ? E.slice().sort((a, b) => a.w * a.d - b.w * b.d).slice(0, -1) : E; P.reservar(0, (fz + P.D / 2) / 2, 1, (P.D / 2 - fz) / 2 - 1, 0);
    for (const e of sacola(P, resto, .9)) for (let z = P.D / 2 - 2.5; z > fz + 2; z -= 2.2) { if (P.tentar(e, 1, () => [P.r.um([-1, 1]) * (1.6 + e.d / 2), z, 0], .3)) break; } } },
  palco: { f: 'cenicos', nome: 'Palco', desc: 'cena montada no fundo e plateia de frente para ela', g(P, E) {
    const r = P.r, bag = sacola(P, E, 1); const fundo = bag.filter(grande), frente = bag.filter(e => !grande(e));
    for (const e of fundo) P.tentar(e, 40, () => [r.entre(-.4, .4) * P.W, r.entre(-.47, -.25) * P.D, r.gauss() * 15], .3);
    for (const e of frente) P.tentar(e, 40, () => [r.entre(-.45, .45) * P.W, r.entre(.0, .4) * P.D, 180 + r.gauss() * 8], .5); } },
  vigilia: { f: 'cenicos', nome: 'Vigília', desc: 'tudo virado para o mesmo ponto vazio', g(P, E) { const r = P.r, alvo = P.U(.25, -.3, .1); P.reservar(alvo[0], alvo[1], 1.5, 1.5, 0); espalhar(P, E, { k: 1, folga: .6, rot: (x, z) => virado(x, z, alvo[0], alvo[1]) }); P.alvo = alvo; } },
  barricadas: { f: 'cenicos', nome: 'Barricadas', desc: 'linhas de objetos atravessando o espaço, com brechas', g(P, E) {
    const r = P.r, n = r.int(2, 4), bag = sacola(P, E, 1.4);
    for (let b = 0; b < n; b++) { const z = -P.D / 2 + (b + .7) * P.D / (n + .5), brechas = Array.from({ length: r.int(1, 2) }, () => r.entre(-.4, .4) * P.W), torto = r.gauss() * 6;
      for (let x = -P.W / 2 + .4; x < P.W / 2 - .4;) { const e = bag.shift(); if (!e) break; if (brechas.some(q => Math.abs(q - x - e.w / 2) < 1.2)) { bag.push(e); x += 2.2; continue; }
        if (!P.por(e, x + e.w / 2, z + x * Math.tan(rad(torto)), torto + r.um([0, 180]), 1, .02)) bag.push(e); x += e.w + .05; } }
    for (const e of bag.slice(0, 6)) P.tentar(e, 20, () => [...P.U(), r.entre(0, 360)], .5); } },
  // ---------------- caóticos
  caotico: { f: 'caoticos', nome: 'Caótico', desc: 'pilhas, ângulos tortos, escalas variadas, apertado', g(P, E) {
    const r = P.r; espalhar(P, E, { k: 1.35, folga: .05, tent: 90, pos: () => P.inst.length && r() < .55 ? (([b]) => [b.x + r.gauss() * 1.6, b.z + r.gauss() * 1.6])([r.um(P.inst)]) : P.U(), rot: () => r.entre(0, 360), esc: [.75, 1.3] }); } },
  denso: { f: 'caoticos', nome: 'Denso', desc: 'abarrotado: só passagens estreitas', g(P, E) { espalhar(P, E, { k: 2.4, folga: .45, tent: 120, esc: [.9, 1.1] }); } },
  ruina: { f: 'caoticos', nome: 'Ruína', desc: 'uma ordem desfeita: faltas, tortos, paredes quebradas', g(P, E) {
    const r = P.r; fileiras(P, E, { falha: .4, torto: 18, corredor: 2 });
    for (let k = 0; k < r.int(4, 9); k++) { const [x, z] = P.U(.42, -.45, .3), a = r.int(0, 1) * Math.PI / 2 + r.gauss() * .15, c = r.entre(1, 4); const x1 = x + Math.cos(a) * c, z1 = z + Math.sin(a) * c;
      if (P.livre((x + x1) / 2, (z + z1) / 2, Math.abs(x1 - x) / 2 + .1, Math.abs(z1 - z) / 2 + .1, .2)) P.parede(x, z, x1, z1, r.entre(.6, 2.4)); } } },
  destrocos: { f: 'caoticos', nome: 'Destroços', desc: 'leque de restos a partir de um ponto de impacto', g(P, E) {
    const r = P.r, [ix, iz] = [r.entre(-.3, .3) * P.W, -P.D * .32], dir = Math.PI / 2 + r.gauss() * .3; P.impacto = [ix, iz];
    for (const e of sacola(P, E, 1.3)) P.tentar(e, 60, () => { const d = (grande(e) ? .6 : 1.4) * -Math.log(1 - r() * .95) * L(P) * .22 + 1, a = dir + r.gauss() * .55; return [ix + Math.cos(a) * d, iz + Math.sin(a) * d, r.entre(0, 360), r.entre(.8, 1.15)]; }, .1); } },
  invasao: { f: 'caoticos', nome: 'Invasão', desc: 'uma ordem tomada por uma mancha que cresce de um canto', g(P, E) {
    const r = P.r, [ox, oz] = [r.um([-1, 1]) * P.W * .45, -P.D * .45], R = L(P) * r.entre(.45, .7), dentro = (x, z) => Math.hypot(x - ox, z - oz) < R;
    const tipos = [...E].sort((a, b) => a.w * a.d - b.w * b.d), mancha = tipos.slice(0, Math.max(1, Math.ceil(tipos.length / 2))), ordem = tipos.slice(mancha.length);
    fileiras(P, ordem.length ? ordem : E, { regiao: (x, z) => !dentro(x, z), corredor: 1.8 });
    espalhar(P, mancha, { k: 1.8, folga: .1, peso: (x, z) => dentro(x, z) ? 1 - Math.hypot(x - ox, z - oz) / R * .7 : 0, rot: () => r.entre(0, 360), esc: [.7, 1.3], tent: 120 }); } },
  // ---- do jogo: o jeito dos níveis de A Bolha (world/WorldGenerator.gd, RoomBuilder.gd)
  escritorio_infinito: { f: 'jogo', nome: 'Escritório infinito', desc: 'nível 0: salas por partição, porta de 1,2 m em cada parede, às vezes um vão aberto', g(P, E) {
    const g = grade(P), S = salasDoJogo(P, g); mobiliar(P, g, S.ab, E, { k: .9, centros: centrosSalas(P, S.salas), salas: comFuncoes(P, S.salas, (i, j) => S.mapa[i][j]) }); } },
  arquivo_morto: { f: 'jogo', nome: 'Arquivo morto', desc: 'nível 1: as salas do escritório tomadas por fileiras de arquivo', g(P, E) {
    const g = grade(P), S = salasDoJogo(P, g), grandes = S.salas.map(q => (q[2] - q[0]) * (q[3] - q[1]) >= 4);
    const regiao = (x, z) => { const i = Math.floor((x + P.W / 2) / P.cel), j = Math.floor((z + P.D / 2) / P.cel); return i >= 0 && j >= 0 && i < g.cols && j < g.rows && grandes[S.mapa[i][j]]; };
    const SF = comFuncoes(P, S.salas, (i, j) => S.mapa[i][j]), fil = E.filter(e => !e.comodos?.length || e.comodos.includes('arquivo'));
    if (!P.prog) fileiras(P, fil.length ? fil : E, { k: .8, corredor: 1.3, vao: .35, regiao }); mobiliar(P, g, S.ab, E, { k: .4, centros: centrosSalas(P, S.salas), salas: SF }); } },
  corredores_concreto: { f: 'jogo', nome: 'Corredores de concreto', desc: 'nível 2: cruz de corredores a cada 8 células, salas nos quadrantes com portas para o corredor', g(P, E) {
    const g = grade(P), m = mapaVazio(g, 0), r = P.r, seg = (i) => Math.floor(i / 8) * 2 + (i % 8 > 3 ? 1 : 0), ab = vazio(g), vaos = [], salas = [], idx = {};
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) m[i][j] = i % 8 === 3 || j % 8 === 3 ? 0 : 1 + seg(i) + seg(j) * 1000;
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { const v = m[i][j]; if (!v) continue; if (!(v in idx)) { idx[v] = salas.length; salas.push([i, j, i + 1, j + 1]); } const q = salas[idx[v]]; q[0] = Math.min(q[0], i); q[1] = Math.min(q[1], j); q[2] = Math.max(q[2], i + 1); q[3] = Math.max(q[3], j + 1); }
    abrirIguais(ab, g, m);
    const tem = {};
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) for (const l of [1, 2]) { const a = i + (l === 1 ? 1 : 0), b = j + (l === 2 ? 1 : 0); if (a >= g.cols || b >= g.rows) continue;
      const s = m[i][j], t = m[a][b]; if (s === t || (s && t)) continue; const sala = s || t;
      if (!tem[sala] || r() < .35) { tem[sala] = 1; vaos.push([l === 1, l === 1 ? a : b, l === 1 ? j : i]); } }
    inicioEm(P, g); erguer(P, g, ab); cortarPortas(P, vaos);
    for (const v of vaos) abrirAresta(ab, g, v);
    mobiliar(P, g, ab, E, { k: .9, centros: centrosSalas(P, salas), salas: comFuncoes(P, salas, (i, j) => (m[i][j] ? idx[m[i][j]] : -1)) }); } },
  jardim_labirinto: { f: 'jogo', nome: 'Jardim-labirinto', desc: 'jardins do nível 0: sebes grossas em labirinto, às vezes uma torre no centro', g(P, E) {
    const g = grade(P), r = P.r; P.esp = .9; P.alt = 2.03; const ab = labirinto(P, g, r, 0);
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) for (const l of [1, 2]) if ((l === 1 ? i + 1 < g.cols : j + 1 < g.rows) && !ab[i][j][l] && r() < .1) abrir(ab, g, i, j, l);
    const ci = Math.floor(g.cols / 2), cj = Math.floor(g.rows / 2);
    if (g.cols >= 4 && g.rows >= 4 && r() < .4) { abrir(ab, g, ci - 1, cj - 1, 1); abrir(ab, g, ci - 1, cj, 1); abrir(ab, g, ci - 1, cj - 1, 2); abrir(ab, g, ci, cj - 1, 2);
      const f = marco(E, 'torre'); if (f) P.por(f, -P.W / 2 + ci * P.cel, -P.D / 2 + cj * P.cel, 0, 1, .4); }
    inicioEm(P, g); erguer(P, g, ab); } },
  praca: { f: 'jogo', nome: 'Praça', desc: 'jardins do nível 0: árvores, bancos e canteiros soltos nas células, fonte no meio', g(P, E) {
    const r = P.r; if (r() < .6) { const f = marco(E, 'fonte'); if (f) P.por(f, 0, 0, 0, 1, .8); }
    espalhar(P, E.filter(e => e !== marco(E, 'fonte')), { k: .9, folga: .4, pos: naCelula(P, .5), rot: () => r.int(0, 3) * 90 }); } },
  campo: { f: 'jogo', nome: 'Campo', desc: 'nível 3 (a Zona): campo aberto com cadeiras soltas viradas para lá e para cá; às vezes uma torre', g(P, E) {
    const r = P.r; if (r() < .35) { const f = marco(E, 'torre'); if (f) P.por(f, 0, -P.D * .1, 0, 1, 1.2); }
    espalhar(P, E.filter(e => e !== marco(E, 'torre')), { k: 1, folga: .3, pos: naCelula(P, .8), rot: () => (r() < .5 ? 0 : 180) }); } },
  espelhos: { f: 'jogo', nome: 'Espelhos', desc: 'nível 3: peças em pé espalhadas pelas células, quase de frente, um pouco tortas', g(P, E) {
    const r = P.r; espalhar(P, E, { k: 1, folga: .3, pos: naCelula(P, .9), rot: () => r.entre(-15, 15) }); } },
  canal: { f: 'jogo', nome: 'Canal', desc: 'nível 3: um canal atravessa entre dois muretes com duas passagens; o miúdo na água, o resto fora', g(P, E) {
    const r = P.r, cols = Math.max(2, Math.round(P.W / 3)), cw = P.W / cols, z0 = -P.D / 2 + P.D * .25, z1 = -P.D / 2 + P.D * .75;
    const g0 = Math.min(cols - 1, Math.floor(cols * .125) + r.int(0, 1)), g1 = Math.min(cols - 1, Math.floor(cols * .625) + r.int(0, 1));
    for (let a = 0; a < cols; a++) if (a !== g0 && a !== g1) for (const z of [z0, z1]) P.parede(-P.W / 2 + a * cw, z, -P.W / 2 + (a + 1) * cw, z, 1.3 + r() * .25, .44);
    const peq = E.filter(e => e.w * e.d <= .6), gr = E.filter(e => e.w * e.d > .6);
    if (peq.length) espalhar(P, peq, { k: 1, folga: .2, tent: 90, peso: (x, z) => (z > z0 + .5 && z < z1 - .5 ? 1 : 0), rot: () => r.entre(0, 360) });
    espalhar(P, gr.length ? gr : E, { k: 1, folga: .5, peso: (x, z) => (z < z0 - .6 || z > z1 + .6 ? 1 : 0) }); } },
  estrada: { f: 'jogo', nome: 'Estrada', desc: 'nível 4: estradas de 6 m em cruz; as coisas nos lotes, viradas para a estrada', g(P, E) {
    P.reservar(0, 0, P.W / 2, 3, .05); P.reservar(0, 0, 3, P.D / 2, .05); // as duas vias livres antes de pôr qualquer coisa
    margens(P, E, [[-P.W / 2, 0], [P.W / 2, 0]], { k: .6, largura: 6, dist: [.4, 3], folga: .4 });
    margens(P, E, [[0, -P.D / 2], [0, P.D / 2]], { k: .5, largura: 6, dist: [.4, 3], folga: .4 });
    P.faixas = [[-P.W / 2, -3, P.W / 2, 3, 'via'], [-3, -P.D / 2, 3, P.D / 2, 'via']]; } }, // o asfalto: o enfeite cobre com o piso de papel "via"
};

// ------------------------------------------------------------------------------------------------ entrada
// els: [{id, w, d, h, qtd}]  o: {largura, profundidade, densidade}
// o.visual (biblioteca de ladrilhos do nível): o layout sai com o chão em regiões, o estilo de cada parede, as portas e as coisas no chão
export function gerar(estilo, semente, els, o) {
  let L = barreiras(gerarCru(estilo, semente, els, o));
  if (o.inspecionar !== false && !o.fracao) { // a camada de jogabilidade (inspetor.js); zonas da mistura são inspecionadas no todo
    const altos = L.instancias.filter(s => s.y); L = inspecionar({ ...L, instancias: L.instancias.filter(s => !s.y) }, els, o);
    L.instancias = [...L.instancias, ...apoiados(altos, L.instancias, els)]; }
  return enfeitar(L, o.visual || {}, o.funcoes || []);
}
function gerarCru(estilo, semente, els, o) {
  if (estilo === 'mistura') return gerarMistura(o.mistura || MISTURA_PADRAO, semente, els, o);
  o = opcoes(o, estilo);
  const s = ESTILOS[estilo] || ESTILOS.amplo, r = rng(semente * 7919 + [...estilo].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7));
  const P = new Plano(o.largura || 24, o.profundidade || 24, r, { densidade: o.densidade ?? 1, fracao: o.fracao }); P.funcoes = o.funcoes || [];
  P.tema = o.tema; P.alt = REGRAS.temas[o.tema]?.altura || P.alt;
  // diretrizes: só o que é do ambiente do estilo (interno/externo; neutro = o do nível); os acompanhantes nascem junto do líder
  const amb = AMB_ESTILO[estilo] || o.ambiente || 'misto';
  let vivos = els.filter(e => e.qtd > 0 && e.w > 0 && e.d > 0 && cabeAmb(e, amb) && elementoNoEstilo(e, estilo));
  const base = els.filter(e => e.qtd >= 0 && e.w > 0 && e.d > 0 && cabeAmb(e, amb) && elementoNoEstilo(e, estilo)); // quantidade 0: só aparece no conjunto (o telefone sobre a mesa)
  // o programa do nível: estilo com salas monta cada sala pelo seu ambiente (os acompanhantes vão junto, no arranjo);
  // estilo sem salas vira um ambiente só para a zona inteira, com só os elementos dele (e os que não têm ambiente)
  P.prog = P.funcoes.some(f => f.els); let fz = null;
  if (P.prog && SALAS_ESTILO.has(estilo) && !P.funcoes.some(f => f.els && f.peso > 0 && f.amb !== 'externo' && !f.circ && f.arranjo)) P.prog = false;
  if (P.prog && !SALAS_ESTILO.has(estilo)) { fz = funcaoDaZona(P, estilo, amb);
    if (fz) { const F = P.funcoes.filter(f => f.els && (amb === 'misto' || (f.amb || 'interno') === amb)), sel = vivos.filter(e => e.id in fz.els || !F.some(f => e.id in f.els));
      if (sel.length) { vivos = sel; P.o.densidade *= DENS_ZONA[fz.arranjo] ?? 1; } else fz = null; } }
  const ids = new Set(vivos.map(e => e.id)), salasProg = P.prog && SALAS_ESTILO.has(estilo);
  const seg = salasProg ? [] : vivos.filter(e => e.acompanha && e.acompanha !== e.id && ids.has(e.acompanha) && !vivos.find(x => x.id === e.acompanha).acompanha);
  try { s.g(P, vivos.filter(e => !seg.includes(e))); if (seg.length) acompanhar(P, seg, vivos); } catch (err) { console.warn('layout', estilo, err); }
  if (fz) P.salasSemanticas = [{ x0: -P.W / 2, z0: -P.D / 2, x1: P.W / 2, z1: P.D / 2, funcao: fz.id }];
  try { conjuntos(P, o.kits, base, s.f === 'caoticos'); } catch (err) { console.warn('conjuntos', estilo, err); }
  return { id: `${estilo}_${semente}`, estilo, familia: s.f, nome: `${s.nome} #${semente}`, semente, largura: P.W, profundidade: P.D,
           inicio: P.inicio.map(v => +v.toFixed(2)), instancias: P.inst, paredes: P.paredes.map(p => ({ ...p, barreira: tipoBarreira(estilo, amb, o.tema), origem_estilo: estilo, amb })), trilha: P.trilha || null, macicos: P.macicos || [], amb, tema: o.tema, salas: P.salasSemanticas || [], faixas: P.faixas || [], escolhida: false };
}

// ------------------------------------------------------------------------------------------------ mistura de estilos
// O nível é dividido em zonas (retângulos de módulos de 6 m) e cada zona recebe um estilo, pela receita:
//   estilos: {chave: {peso, onde: [início, meio, fim]}}  peso relativo (vira %); onde = curva 0..1 ao longo da jornada
//   grao 0 = manchas grandes … 1 = retalhos;  agrupamento 0 = espalhado … 1 = em bairros (vizinhas puxam o mesmo estilo)
//   costura 0 = parede com uma porta … 1 = sem parede entre zonas;  surpresa = chance de uma zona fugir da receita
//   variacao = quanto os pesos balançam de uma partida para outra;  temas 0 = todos os elementos em toda parte … 1 = cada zona com os seus
export const MODULO = 6;
export const MISTURA_PADRAO = { estilos: { corredores: { peso: 20, onde: [1, .6, .3] }, labirinto_largo: { peso: 30, onde: [.2, .7, 1] }, amplo: { peso: 25, onde: [1, .4, .2] }, salas: { peso: 15, onde: [.4, 1, .6] }, caotico: { peso: 10, onde: [.5, .5, .5] } },
  grao: .45, agrupamento: .6, costura: .3, surpresa: .06, variacao: .15, temas: .4 };
export const PERSONALIDADES = {
  'Escritório': { estilos: { cubiculos: { peso: 40, onde: [.6, 1, .8] }, corredores: { peso: 25, onde: [1, .7, .5] }, salas: { peso: 25, onde: [.3, .7, 1] }, organizado: { peso: 10, onde: [1, .4, .3] } }, grao: .4, agrupamento: .7, costura: .25, surpresa: .04, variacao: .1, temas: .5 },
  'Fábrica abandonada': { estilos: { estacionamento: { peso: 20, onde: [1, .6, .3] }, ruina: { peso: 30, onde: [.4, 1, .8] }, caotico: { peso: 25, onde: [.2, .6, 1] }, destrocos: { peso: 15, onde: [.3, .5, 1] }, hipostilo: { peso: 10, onde: [.5, 1, .5] } }, grao: .35, agrupamento: .5, costura: .6, surpresa: .1, variacao: .2, temas: .45 },
  'Catacumba': { estilos: { corredores: { peso: 30, onde: [1, .8, .5] }, labirinto: { peso: 35, onde: [.3, .8, 1] }, celas: { peso: 20, onde: [.5, 1, .7] }, altar: { peso: 15, onde: [0, .3, 1] } }, grao: .55, agrupamento: .6, costura: .1, surpresa: .05, variacao: .15, temas: .6 },
  'Parque': { estilos: { trilha: { peso: 30, onde: [1, .8, .6] }, clareira: { peso: 20, onde: [.6, 1, .6] }, floresta: { peso: 30, onde: [.3, .7, 1] }, ilhas: { peso: 20, onde: [.8, .8, .8] } }, grao: .3, agrupamento: .75, costura: 1, surpresa: .06, variacao: .2, temas: .5 },
  // os níveis do jogo como mistura (pesos = as proporções de prédio, jardim e praça dos .tres de world/levels)
  'Jogo · Nível 0 — Escritório infinito': { estilos: { escritorio_infinito: { peso: 64, onde: [1, 1, 1] }, jardim_labirinto: { peso: 23, onde: [.6, 1, 1] }, praca: { peso: 13, onde: [.6, 1, 1] } }, grao: .15, agrupamento: .7, costura: .3, surpresa: 0, variacao: .1, temas: .4 },
  'Jogo · Nível 1 — Arquivo morto': { estilos: { arquivo_morto: { peso: 100, onde: [1, 1, 1] } }, grao: .15, agrupamento: .8, costura: .3, surpresa: 0, variacao: .1, temas: .4 },
  'Jogo · Nível 2 — Corredores de concreto': { estilos: { corredores_concreto: { peso: 100, onde: [1, 1, 1] } }, grao: .2, agrupamento: .9, costura: .3, surpresa: 0, variacao: .1, temas: .4 },
  'Jogo · Nível 3 — A Zona': { estilos: { campo: { peso: 45, onde: [1, 1, 1] }, espelhos: { peso: 35, onde: [1, 1, 1] }, canal: { peso: 20, onde: [1, 1, 1] } }, grao: .35, agrupamento: .5, costura: 1, surpresa: 0, variacao: .15, temas: .5 },
  'Jogo · Nível 4 — Estrada de névoa': { estilos: { estrada: { peso: 100, onde: [1, 1, 1] } }, grao: .2, agrupamento: .9, costura: 1, surpresa: 0, variacao: .1, temas: .4 },
  'Jogo · Prólogo — Último dia': { estilos: { escritorio_infinito: { peso: 60, onde: [1, 1, 1] }, cubiculos: { peso: 40, onde: [1, .8, .6] } }, grao: .15, agrupamento: .7, costura: .25, surpresa: 0, variacao: .1, temas: .5 },
  'Labirinto vivo': { estilos: { labirinto_largo: { peso: 50, onde: [.4, 1, 1] }, labirinto: { peso: 20, onde: [.2, .6, 1] }, clareira: { peso: 15, onde: [1, .5, .3] }, corredor_unico: { peso: 15, onde: [.5, .5, .5] } }, grao: .5, agrupamento: .4, costura: .2, surpresa: .08, variacao: .15, temas: .3 },
};
// uma cor estável por estilo, para os mapas da mistura
export function corEstilo(k) { const ks = Object.keys(ESTILOS), i = Math.max(0, ks.indexOf(k)); return `hsl(${(i * 137.5) % 360} 62% 58%)`; }
// estilos de grade arredondam o chão para caber células inteiras: numa zona pequena demais eles transbordariam
const _cabe = new Map();
function cabe(k, w, d) { const ch = `${k}|${w}|${d}`; if (!_cabe.has(ch)) { const L = gerar(k, 1, [], { largura: w, profundidade: d, inspecionar: false }); _cabe.set(ch, L.largura <= w + .01 && L.profundidade <= d + .01); } return _cabe.get(ch); }
const cabeZona = (k, z) => { const w = (z.i1 - z.i0) * MODULO, d = (z.j1 - z.j0) * MODULO; return cabe(k, w, d) && cabe(k, d, w); };
const curva = (onde, t) => { const [a, b, c] = onde || [1, 1, 1]; return t < .5 ? a + (b - a) * t * 2 : b + (c - b) * (t - .5) * 2; };

// divide a grade de módulos em retângulos: corte fora do centro, tamanho alvo pelo grão
function zonear(cols, rows, grao, r) {
  const total = cols * rows, alvo = Math.max(1, total * Math.pow(1 - grao, 2.2) * .5 + 1), zs = [];
  const div = (i0, j0, i1, j1) => { const w = i1 - i0, h = j1 - j0, a = w * h;
    const para = a <= alvo * r.entre(.6, 1.6) || (w < 2 && h < 2) || (a <= alvo * 2.2 && r() < .25);
    if (para) { zs.push({ i0, j0, i1, j1 }); return; }
    const vert = w > 1 && (h < 2 || (w / h > r.entre(.7, 1.4))); // corta no lado maior, com folga para formatos alongados
    if (vert) { const c = i0 + Math.max(1, Math.min(w - 1, Math.round(w * r.entre(.25, .75)))); div(i0, j0, c, j1); div(c, j0, i1, j1); }
    else { const c = j0 + Math.max(1, Math.min(h - 1, Math.round(h * r.entre(.25, .75)))); div(i0, j0, i1, c); div(i0, c, i1, j1); } };
  div(0, 0, cols, rows); return zs;
}
// bordas compartilhadas entre zonas: {a, b, eixo: 'x' (borda vertical, em i fixo) | 'z', fixo, de, ate} em módulos
function vizinhancas(zs) {
  const out = [];
  for (let a = 0; a < zs.length; a++) for (let b = a + 1; b < zs.length; b++) { const A = zs[a], B = zs[b];
    for (const [p, q] of [[A, B], [B, A]]) {
      if (p.i1 === q.i0) { const de = Math.max(p.j0, q.j0), ate = Math.min(p.j1, q.j1); if (ate > de) out.push({ a, b, eixo: 'x', fixo: p.i1, de, ate }); }
      if (p.j1 === q.j0) { const de = Math.max(p.i0, q.i0), ate = Math.min(p.i1, q.i1); if (ate > de) out.push({ a, b, eixo: 'z', fixo: p.j1, de, ate }); } } }
  return out;
}
// corta um vão [u0, u1] numa linha de borda; as paredes que caem nela são encurtadas ou partidas
function cortarVao(paredes, eixo, fixo, u0, u1) {
  const out = [];
  for (const p of paredes) {
    const a = p.rot * Math.PI / 180, dx = Math.cos(a) * p.comp / 2, dz = -Math.sin(a) * p.comp / 2;
    const vert = Math.abs(dx) < 1e-3, horiz = Math.abs(dz) < 1e-3, naLinha = eixo === 'x' ? vert && Math.abs(p.x - fixo) < .3 : horiz && Math.abs(p.z - fixo) < .3;
    if (!naLinha || p.comp === p.esp && p.comp < 1) { out.push(p); continue; }
    const c = eixo === 'x' ? p.z : p.x, ini = c - p.comp / 2, fim = c + p.comp / 2;
    if (fim <= u0 || ini >= u1) { out.push(p); continue; }
    for (const [s0, s1] of [[ini, Math.min(fim, u0)], [Math.max(ini, u1), fim]]) { if (s1 - s0 < .25) continue; const m = (s0 + s1) / 2;
      out.push({ ...p, comp: +(s1 - s0).toFixed(3), x: +(eixo === 'x' ? p.x : m).toFixed(3), z: +(eixo === 'x' ? m : p.z).toFixed(3) }); }
  }
  return out;
}

export function gerarMistura(M, semente, els, o) {
  const r = rng(semente * 104729 + 17), C = MODULO, dens = o.densidade ?? 1;
  const cols = Math.max(2, Math.round((o.largura || 24) / C)), rows = Math.max(2, Math.round((o.profundidade || 24) / C)), W = cols * C, D = rows * C;
  // receita, com a variação desta partida
  let rec = Object.entries(M.estilos || {}).filter(([k, v]) => ESTILOS[k] && v.peso > 0).map(([k, v]) => ({ k, onde: v.onde, p: v.peso * Math.max(.05, 1 + (M.variacao ?? 0) * r.gauss()) }));
  if (!rec.length) rec = [{ k: 'amplo', p: 1 }];
  const soma = rec.reduce((s, x) => s + x.p, 0); rec.forEach(x => (x.p /= soma));
  const extras = (o.liberados || []).filter(k => ESTILOS[k] && !rec.some(x => x.k === k)), pool = extras.length ? extras : Object.keys(ESTILOS).filter(k => !rec.some(x => x.k === k));
  // zonas e a jornada: a entrada é a zona de baixo no meio (z+ = perto da câmera); t = mistura de saltos desde ela e profundidade
  const zs = zonear(cols, rows, M.grao ?? .45, r), viz = vizinhancas(zs), adj = zs.map(() => []);
  viz.forEach(v => { adj[v.a].push(v); adj[v.b].push(v); });
  const ent = zs.findIndex(z => z.j1 === rows && z.i0 <= Math.floor(cols / 2) && z.i1 > Math.floor(cols / 2)), salto = zs.map(() => Infinity), pai = zs.map(() => -1);
  salto[ent] = 0; for (const fila = [ent]; fila.length;) { const a = fila.shift(); for (const v of adj[a]) { const b = v.a === a ? v.b : v.a; if (salto[b] === Infinity) { salto[b] = salto[a] + 1; pai[b] = a; fila.push(b); } } }
  const maxS = Math.max(1, ...salto.filter(isFinite));
  zs.forEach((z, n) => { z.area = (z.i1 - z.i0) * (z.j1 - z.j0); z.t = .5 * salto[n] / maxS + .5 * (1 - ((z.j0 + z.j1) / 2) / rows); });
  // escolhe o estilo de cada zona, da entrada para o fundo. Se o sorteado não cabe (grade de células), a zona cresce
  // engolindo uma vizinha ainda livre (ou do mesmo estilo) enquanto a união for um retângulo
  const ganho = Object.fromEntries(rec.map(x => [x.k, 0])), A = cols * rows, agr = M.agrupamento ?? .6;
  const uniao = (p, q) => ((p.i1 === q.i0 || q.i1 === p.i0) && p.j0 === q.j0 && p.j1 === q.j1) || ((p.j1 === q.j0 || q.j1 === p.j0) && p.i0 === q.i0 && p.i1 === q.i1);
  const toca = (p, q) => (p.i1 === q.i0 || q.i1 === p.i0) && Math.min(p.j1, q.j1) > Math.max(p.j0, q.j0) ? Math.min(p.j1, q.j1) - Math.max(p.j0, q.j0)
    : (p.j1 === q.j0 || q.j1 === p.j0) && Math.min(p.i1, q.i1) > Math.max(p.i0, q.i0) ? Math.min(p.i1, q.i1) - Math.max(p.i0, q.i0) : 0;
  const nota = (x, z) => { const borda = {}; let bordaT = 0;
    for (const q of zs) { if (q === z || q.morta) continue; const L = toca(z, q); if (!L) continue; bordaT += L; if (q.estilo) borda[q.estilo] = (borda[q.estilo] || 0) + L; }
    const alvo = x.p * A, falta = Math.max(.06, 1.35 - ganho[x.k] / Math.max(alvo, .01));
    return Math.max(1e-4, x.p * Math.max(.02, curva(x.onde, z.t)) * falta * (1 + agr * 5 * (borda[x.k] || 0) / Math.max(1, bordaT))); };
  const sorteia = (ns) => { let q = r() * ns.reduce((s, v) => s + v, 0), i = 0; while (i < ns.length - 1 && (q -= ns[i]) > 0) i++; return i; };
  for (const z of [...zs].sort((a, b) => a.t - b.t)) {
    if (z.morta || z.estilo) continue;
    if (r() < (M.surpresa ?? 0)) { const pz = pool.filter(k => cabeZona(k, z)); if (pz.length) { z.estilo = r.um(pz); z.surpresa = true; continue; } }
    const k = rec[sorteia(rec.map(x => nota(x, z)))].k;
    for (let g = 0; g < 8 && !cabeZona(k, z); g++) {
      const qs = zs.filter(q => q !== z && !q.morta && !q.surpresa && (!q.estilo || q.estilo === k) && uniao(z, q)); if (!qs.length) break;
      const q = r.um(qs); if (q.estilo === k) ganho[k] -= q.area;
      Object.assign(z, { i0: Math.min(z.i0, q.i0), j0: Math.min(z.j0, q.j0), i1: Math.max(z.i1, q.i1), j1: Math.max(z.j1, q.j1), area: z.area + q.area, t: Math.min(z.t, q.t) }); q.morta = true;
    }
    if (cabeZona(k, z)) { z.estilo = k; ganho[k] += z.area; continue; }
    const cab = rec.filter(x => cabeZona(x.k, z)); // não deu para crescer: fica com o que cabe
    if (cab.length) { const x = cab[sorteia(cab.map(x => nota(x, z)))]; z.estilo = x.k; ganho[x.k] += z.area; }
    else { const pz = pool.filter(k => cabeZona(k, z)); z.estilo = pz.length ? r.um(pz) : 'amplo'; z.surpresa = true; }
  }
  for (let n = zs.length - 1; n >= 0; n--) if (zs[n].morta) zs.splice(n, 1);
  // vizinhas iguais que formam um retângulo viram uma zona só (um labirinto grande em vez de dois pequenos)
  for (let mud = true; mud;) { mud = false;
    for (let a = 0; a < zs.length && !mud; a++) for (let b = 0; b < zs.length && !mud; b++) { if (a === b) continue; const p = zs[a], q = zs[b];
      if (p.estilo !== q.estilo || p.surpresa || q.surpresa || r() > agr) continue;
      const lado = (p.i1 === q.i0 && p.j0 === q.j0 && p.j1 === q.j1) || (p.j1 === q.j0 && p.i0 === q.i0 && p.i1 === q.i1);
      if (lado) { p.i1 = Math.max(p.i1, q.i1); p.j1 = Math.max(p.j1, q.j1); p.area += q.area; p.t = Math.min(p.t, q.t); zs.splice(b, 1); mud = true; } } }
  // de novo as vizinhanças e a árvore da jornada, já com as zonas fundidas
  const vz = vizinhancas(zs), ad2 = zs.map(() => []); vz.forEach(v => { ad2[v.a].push(v); ad2[v.b].push(v); });
  const e2 = zs.findIndex(z => z.j1 === rows && z.i0 <= Math.floor(cols / 2) && z.i1 > Math.floor(cols / 2)), pai2 = zs.map(() => -1), vis = new Set([e2]);
  for (const fila = [e2]; fila.length;) { const a = fila.shift(); for (const v of r.embaralha([...ad2[a]])) { const b = v.a === a ? v.b : v.a; if (!vis.has(b)) { vis.add(b); pai2[b] = a; fila.push(b); } } }
  // temas: cada zona puxa um subconjunto dos elementos
  const vivos = els.filter(e => e.qtd > 0 && e.w > 0 && e.d > 0), tem = M.temas ?? .4, soConjunto = els.filter(e => e.qtd === 0 && e.w > 0 && e.d > 0);
  // gera cada zona no seu tamanho, gira para a frente dela olhar de onde se chega, e põe no lugar
  const inst = [], paredes = [], macicos = [], faixas = [], salas = []; let inicio = [0, D / 2 - 1.6];
  zs.forEach((z, n) => {
    const wz = (z.i1 - z.i0) * C, dz = (z.j1 - z.j0) * C, cx = -W / 2 + (z.i0 + z.i1) / 2 * C, cz = -D / 2 + (z.j0 + z.j1) / 2 * C;
    let th = 0; if (n !== e2 && pai2[n] >= 0) { const p = zs[pai2[n]], px = -W / 2 + (p.i0 + p.i1) / 2 * C - cx, pz = -D / 2 + (p.j0 + p.j1) / 2 * C - cz; th = Math.abs(px) / wz > Math.abs(pz) / dz ? (px > 0 ? 90 : 270) : (pz > 0 ? 0 : 180); }
    else if (n !== e2) th = r.um([0, 90, 180, 270]);
    const lw = th % 180 ? dz : wz, ld = th % 180 ? wz : dz, fr = z.area / (cols * rows);
    const escolha = r.embaralha([...vivos]).slice(0, Math.max(1, Math.ceil(vivos.length * r.entre(.35, .65))));
    const elsZ = [...vivos.map(e => ({ ...e, qtd: e.qtd * fr * (escolha.includes(e) ? 1 + tem * (vivos.length / escolha.length - 1) : 1 - tem) })), ...soConjunto]; // os de quantidade 0 vão junto (só nos conjuntos)
    const L = gerarCru(z.estilo, Math.floor(r() * 1e6) + 1, elsZ, { largura: lw, profundidade: ld, densidade: dens, fracao: true, ambiente: o.ambiente, funcoes: o.funcoes, tema: o.tema, kits: o.kits });
    const a = th * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), T = (u, v) => [cx + u * ca + v * sa, cz - u * sa + v * ca], gira = (g) => +((((g + th) % 360) + 360) % 360).toFixed(1);
    for (const s of L.instancias) { const [x, zz] = T(s.x, s.z); inst.push({ ...s, x: f3(x), z: f3(zz), rot: gira(s.rot), zona: n }); }
    for (const p of L.paredes) { const [x, zz] = T(p.x, p.z); paredes.push({ ...p, x: f3(x), z: f3(zz), rot: gira(p.rot) }); }
    for (const s of L.salas || []) { const [ax, az] = T(s.x0, s.z0), [bx, bz] = T(s.x1, s.z1); salas.push({ ...s, x0: f3(Math.min(ax, bx)), z0: f3(Math.min(az, bz)), x1: f3(Math.max(ax, bx)), z1: f3(Math.max(az, bz)) }); }
    for (const [mx, mz, h] of L.macicos) { const [x, zz] = T(mx, mz); macicos.push([x, zz, h, n]); }
    for (const [u0, v0, u1, v1, papel] of L.faixas || []) { const [ax, az] = T(u0, v0), [bx, bz] = T(u1, v1);
      faixas.push([+Math.min(ax, bx).toFixed(3), +Math.min(az, bz).toFixed(3), +Math.max(ax, bx).toFixed(3), +Math.max(az, bz).toFixed(3), papel]); }
    if (n === e2) inicio = T(...L.inicio);
    Object.assign(z, { x: cx, z: cz, w: wz, d: dz, rot: th });
  });
  // passagens entre zonas vizinhas: uma porta (ou mais, ou a borda toda aberta) onde os dois lados são andáveis
  const costura = M.costura ?? .3, andavel = (x, zz, zona) => !macicos.some(([mx, mz, h, n]) => n === zona && Math.abs(x - mx) < h && Math.abs(zz - mz) < h);
  let pw = paredes; const vaos = [];
  for (const v of vz) {
    const fixo = (v.eixo === 'x' ? -W / 2 : -D / 2) + v.fixo * C, u0 = (v.eixo === 'x' ? -D / 2 : -W / 2) + v.de * C, u1 = (v.eixo === 'x' ? -D / 2 : -W / 2) + v.ate * C;
    const arvore = pai2[v.a] === v.b || pai2[v.b] === v.a;
    if (!arvore && r() > .25 + costura * .75) continue; // nem toda vizinha se liga: assim o lugar tem fundos
    if (costura > .85) { pw = cortarVao(pw, v.eixo, fixo, u0, u1); vaos.push([v.eixo, fixo, u0, u1]); continue; }
    const cand = []; for (let u = u0 + 1.5; u < u1; u += 3) { const [xa, za] = v.eixo === 'x' ? [fixo - 1.5, u] : [u, fixo - 1.5], [xb, zb] = v.eixo === 'x' ? [fixo + 1.5, u] : [u, fixo + 1.5];
      const ia = (v.eixo === 'x' ? zs[v.a].x : zs[v.a].z) < fixo ? v.a : v.b, ib = ia === v.a ? v.b : v.a; if (andavel(xa, za, ia) && andavel(xb, zb, ib)) cand.push(u); }
    if (!cand.length) continue;
    const nPortas = Math.min(cand.length, 1 + Math.floor(costura * 2.5 * r() * (u1 - u0) / 12)), larg = 1.4 + costura * 1.2;
    for (const u of r.embaralha(cand).slice(0, nPortas)) { pw = cortarVao(pw, v.eixo, fixo, u - larg / 2, u + larg / 2); vaos.push([v.eixo, fixo, u - larg / 2, u + larg / 2]); }
  }
  // tira objetos que ficaram na frente das passagens
  const livre = inst.filter(s => { const e = els.find(e => e.id === s.elemento); if (!e) return true; const h = Math.max(e.w, e.d) * (s.escala || 1) / 2;
    return !vaos.some(([eixo, fixo, a, b]) => { const n = eixo === 'x' ? s.x : s.z, u = eixo === 'x' ? s.z : s.x; return Math.abs(n - fixo) < 1.6 + h && u > a - h && u < b + h; }); });
  const zonas = zs.map(z => ({ estilo: z.estilo, x: z.x, z: z.z, w: z.w, d: z.d, t: +z.t.toFixed(2), surpresa: !!z.surpresa, amb: AMB_ESTILO[z.estilo] || o.ambiente || 'misto' }));
  return { id: `mistura_${semente}`, estilo: 'mistura', familia: 'mistura', nome: `Mistura #${semente}`, semente, largura: W, profundidade: D,
           inicio: inicio.map(v => +v.toFixed(2)), instancias: livre.map(({ zona, ...s }) => s), paredes: pw, trilha: null, zonas, tema: o.tema || '', salas, macicos: macicos.map(([x, z, h]) => [x, z, h]), faixas, escolhida: false };
}
// quanto de área ficou com cada estilo (0..1)
export function contaMistura(L) { const out = {}, A = L.largura * L.profundidade; for (const z of L.zonas || []) out[z.estilo] = (out[z.estilo] || 0) + z.w * z.d / A; return out; }

// planta vista de cima num canvas
export function desenhar(cv, Lx, els, op = {}) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, esc = Math.min((W - 6) / Lx.largura, (H - 6) / Lx.profundidade);
  const ox = W / 2, oz = H / 2, X = (x) => ox + x * esc, Z = (z) => oz + z * esc, porId = Object.fromEntries(els.map(e => [e.id, e]));
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = css.getPropertyValue('--chao').trim() || '#2a2a2e'; ctx.fillRect(X(-Lx.largura / 2), Z(-Lx.profundidade / 2), Lx.largura * esc, Lx.profundidade * esc);
  if (Lx.chao && Lx.visual && _corPiso) { const porId = Object.fromEntries(Lx.visual.pisos.map(p => [p.id, p]));
    for (const g of Lx.chao) { const p = porId[g.p]; if (!p) continue; ctx.fillStyle = cssDe(_corPiso, p.cls, p.v * .55); ctx.fillRect(X(g.x0), Z(g.z0), (g.x1 - g.x0) * esc, (g.z1 - g.z0) * esc); } }
  if (Lx.camadas_chao && _corPiso) for (const [x0,z0,x1,z1,cls,v] of Lx.camadas_chao) {
    ctx.fillStyle = cssDe(_corPiso, cls, v * .7); ctx.fillRect(X(x0), Z(z0), (x1-x0)*esc, (z1-z0)*esc); }
  if (Lx.trilha) { ctx.strokeStyle = 'rgba(160,190,255,.16)'; ctx.lineWidth = 1.8 * esc; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath(); Lx.trilha.forEach(([x, z], i) => i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))); ctx.stroke(); }
  for (const p of Lx.paredes || []) { ctx.fillStyle = p.alt < 2 ? (css.getPropertyValue('--parede-baixa').trim() || '#888') : (css.getPropertyValue('--parede').trim() || '#ccc');
    ctx.save(); ctx.translate(X(p.x), Z(p.z)); ctx.rotate(-rad(p.rot)); const e = Math.max(1.2, p.esp * esc); ctx.fillRect(-p.comp * esc / 2, -e / 2, p.comp * esc, e); ctx.restore(); }
  Lx.instancias.forEach((s, k) => {
    const e = porId[s.elemento]; if (!e) return;
    ctx.save(); ctx.translate(X(s.x), Z(s.z)); ctx.rotate(-rad(s.rot));
    const w = e.w * s.escala * esc, d = e.d * s.escala * esc;
    ctx.fillStyle = e.cor; ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-w / 2, d / 2 - Math.max(1, d * .2), w, Math.max(1, d * .2)); // a frente
    if (op.sel === k) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 - 2, -d / 2 - 2, w + 4, d + 4); }
    ctx.restore();
  });
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(Lx.inicio[0]), Z(Lx.inicio[1]), Math.max(2.5, .45 * esc), 0, 7); ctx.fill(); ctx.stroke();
  return { esc, X, Z, x: (px) => (px - ox) / esc, z: (pz) => (pz - oz) / esc };
}
