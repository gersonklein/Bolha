// Inspetor da Forja: a camada que testa se o layout é jogável e faz sentido, e conserta o que dá durante a geração.
// Roda depois do estilo (gerarCru) e antes do enfeite (pisos), sem sorteio: o mesmo layout entra, o mesmo sai.
// Portado em forja/gd/ForjaLayout.gd (inspecionar): o que muda instâncias e paredes tem de dar igual nos dois lados
// (rodar testes/paridade.py). O relatório (nota e itens) só a Forja mostra.
//
// Critérios (C = conserta sozinho, R = só relata):
//  C  limite      objeto fora do chão do nível                                  → sai
//  C  parede      objeto atravessando parede ou pilar                           → sai
//  C  sobreposto  dois objetos sólidos um dentro do outro                       → sai o segundo
//  C  porta       objeto sólido na frente de uma porta / vão                    → sai
//  C  inicio      objeto sólido em cima do ponto de partida                     → sai
//  C  encostar    coisa de parede (escada, luminária de parede, estante…) solta no meio do chão
//                 (a "escada para lugar nenhum")                                 → vai para a parede mais perto; sem vaga, sai
//  C  bloqueio    mobília fechando a passagem para uma parte do nível           → sai a peça menor que libera o caminho;
//                 se nenhuma sozinha libera (mesa + cadeira, fileira dupla), abre um corredor: saem as peças do
//                 caminho mais barato (o que atravessa menos mobília) do lado alcançável até o pedaço preso.
//                 A passagem conta com a colisão do jogo (ForjaNivel._geo): a caixa ALINHADA que envolve a peça girada
//                 (mesa redonda girada 30° ocupa mais que o tampo) — regra de circulação da Forja (forja/circulacao.py)
//  C  fechado     cômodo sem nenhuma entrada (só paredes em volta)              → abre uma porta para o lado alcançável
//  C  inalcancavel objeto num canto onde o jogador não chega                    → sai
//  R  alcance     quanto do chão andável se alcança do início
//  R  percurso    a maior distância andando desde o início (o nível tem "fundo"?)
//  R  ocupacao    quanto do chão alcançável a mobília ocupa (nem vazio nem entulhado)
//  R  vazias      cômodos fechados grandes sem nada dentro
//  R  faltando    elementos do nível que não couberam em lugar nenhum
import { acharPortas, espacos } from './pisos.js';

export const RAIO = .3;      // o andarilho (CapsuleShape de raio 0,3)
export const CEL = .25;      // grade de teste
export const PORTA = 1.2;    // vão de porta aberto pelo inspetor (= DOOR do jogo)
const rad = (g) => g * Math.PI / 180;

export const CRITERIOS = {
  limite: 'Objetos dentro do chão', parede: 'Nada atravessando parede', sobreposto: 'Objetos sem se atravessar',
  porta: 'Portas desobstruídas', inicio: 'Início livre', encostar: 'Coisas de parede na parede (sem escada para lugar nenhum)',
  bloqueio: 'Mobília não fecha caminho', fechado: 'Todo cômodo tem entrada', inalcancavel: 'Todo objeto alcançável',
  alcance: 'Chão alcançável do início', percurso: 'Percurso com fundo', ocupacao: 'Ocupação equilibrada', vazias: 'Cômodos sem nada',
  faltando: 'Todos os elementos no nível',
};

// regra de colocação de um elemento pelo nome/descrição (o usuário pode fixar em e.colocacao: 'parede' | 'livre')
const PALAVRAS_PAREDE = ['escada', 'ladder', 'stair', 'parede', 'wall', 'arandela', 'prateleira', 'estante', 'shelf', 'armario', 'cabinet',
  'quadro', 'painel', 'panel', 'corrimao', 'railing', 'guarda-corpo', 'extintor', 'tubula', 'tubo', 'pipe', 'valvula', 'valve', 'lousa', 'espelho', 'mirror'];
export function regraDe(e) {
  if (e.regra === 'parede' || e.regra === 'livre') return e.regra;
  if (e.colocacao === 'parede' || e.colocacao === 'livre') return e.colocacao;
  const t = `${e.id || ''} ${e.nome || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return PALAVRAS_PAREDE.some(p => t.includes(p)) ? 'parede' : 'livre';
}

// ------------------------------------------------------------------------------------------------ geometria
// retângulo orientado: centro, meias medidas (u ao longo do eixo local x, w ao longo do z) e o ângulo (graus, em y)
const q9 = (v) => Math.floor(v * 1e9 + .5) / 1e9; // ângulos retos exatos (cos 90° = 0, não 6e-17): os empates caem igual na Godot
function caixa(x, z, hu, hw, rot) { const a = rad(rot); return { x, z, hu, hw, ca: q9(Math.cos(a)), sa: q9(Math.sin(a)) }; }
const caixaObj = (s, e) => caixa(s.x, s.z, e.w * (s.escala || 1) / 2, e.d * (s.escala || 1) / 2, s.rot || 0);
const caixaPar = (p) => caixa(p.x, p.z, p.comp / 2, (p.esp ?? .2) / 2, p.rot || 0);
// a caixa alinhada aos eixos que envolve a peça girada: é ela que colide no jogo (ForjaNivel._geo)
const alinhada = (b) => { const [ex, ez] = aabb(b); return caixa(b.x, b.z, ex, ez, 0); };
function aabb(b) { const ex = Math.abs(b.ca) * b.hu + Math.abs(b.sa) * b.hw, ez = Math.abs(b.sa) * b.hu + Math.abs(b.ca) * b.hw; return [ex, ez]; }
function dentroCaixa(b, px, pz, m) { const dx = px - b.x, dz = pz - b.z; return Math.abs(dx * b.ca - dz * b.sa) <= b.hu + m && Math.abs(dx * b.sa + dz * b.ca) <= b.hw + m; }
// SAT: as duas caixas se cruzam (encolhidas de m)?
function cruza(A, B, m) {
  const [ax, az] = aabb(A), [bx, bz] = aabb(B), dx = B.x - A.x, dz = B.z - A.z;
  if (Math.abs(dx) >= ax + bx - 2 * m || Math.abs(dz) >= az + bz - 2 * m) return false;
  for (const [ux, uz] of [[A.ca, -A.sa], [A.sa, A.ca], [B.ca, -B.sa], [B.sa, B.ca]]) {
    const ra = A.hu * Math.abs(A.ca * ux - A.sa * uz) + A.hw * Math.abs(A.sa * ux + A.ca * uz) - m;
    const rb = B.hu * Math.abs(B.ca * ux - B.sa * uz) + B.hw * Math.abs(B.sa * ux + B.ca * uz) - m;
    if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
  }
  return true;
}
const solida = (p) => (p.alt ?? 2.6) > .3;

// ------------------------------------------------------------------------------------------------ grade
function Grade(W, D) {
  const nx = Math.ceil(W / CEL - 1e-6), nz = Math.ceil(D / CEL - 1e-6), X0 = -W / 2, Z0 = -D / 2;
  const g = { nx, nz, X0, Z0, N: nx * nz, cx: (i) => X0 + (i + .5) * CEL, cz: (j) => Z0 + (j + .5) * CEL };
  g.de = (x, z) => Math.min(nz - 1, Math.max(0, Math.floor((z - Z0) / CEL))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((x - X0) / CEL)));
  return g;
}
// soma (ou tira) uma caixa inflada de m na contagem da grade
function marcar(g, cont, b, m, d) {
  const [ex, ez] = aabb(b);
  const i0 = Math.max(0, Math.floor((b.x - ex - m - g.X0) / CEL)), i1 = Math.min(g.nx - 1, Math.floor((b.x + ex + m - g.X0) / CEL));
  const j0 = Math.max(0, Math.floor((b.z - ez - m - g.Z0) / CEL)), j1 = Math.min(g.nz - 1, Math.floor((b.z + ez + m - g.Z0) / CEL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (dentroCaixa(b, g.cx(i), g.cz(j), m)) cont[j * g.nx + i] += d;
}
function bordas(g, W, D) { // o chão acaba: o andarilho não passa do limite
  const b = new Int32Array(g.N);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) { const x = g.cx(i), z = g.cz(j); if (x < -W / 2 + RAIO || x > W / 2 - RAIO || z < -D / 2 + RAIO || z > D / 2 - RAIO) b[j * g.nx + i] = 1; }
  return b;
}
// distância (em células) de cada célula livre até o início; -1 = não se chega
function inundar(g, bloq, ini) {
  const dist = new Int32Array(g.N).fill(-1), fila = new Int32Array(g.N);
  if (ini < 0 || bloq[ini]) return dist;
  let a = 0, f = 0; fila[f++] = ini; dist[ini] = 0;
  while (a < f) { const k = fila[a++], i = k % g.nx, j = (k / g.nx) | 0, dk = dist[k] + 1;
    if (i + 1 < g.nx && !bloq[k + 1] && dist[k + 1] < 0) { dist[k + 1] = dk; fila[f++] = k + 1; }
    if (i > 0 && !bloq[k - 1] && dist[k - 1] < 0) { dist[k - 1] = dk; fila[f++] = k - 1; }
    if (j + 1 < g.nz && !bloq[k + g.nx] && dist[k + g.nx] < 0) { dist[k + g.nx] = dk; fila[f++] = k + g.nx; }
    if (j > 0 && !bloq[k - g.nx] && dist[k - g.nx] < 0) { dist[k - g.nx] = dk; fila[f++] = k - g.nx; } }
  return dist;
}
// a célula do início (ou a livre mais perto, até 2 m)
function celInicio(g, bloq, x, z) {
  const i0 = Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.X0) / CEL))), j0 = Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.Z0) / CEL)));
  for (let r = 0; r <= 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = i0 + di, j = j0 + dj;
    if (i >= 0 && j >= 0 && i < g.nx && j < g.nz && !bloq[j * g.nx + i]) return j * g.nx + i; }
  return -1;
}
const somar = (a, b) => { const o = new Int32Array(a.length); for (let k = 0; k < a.length; k++) o[k] = a[k] + b[k]; return o; };
const contar = (dist) => { let n = 0; for (let k = 0; k < dist.length; k++) if (dist[k] >= 0) n++; return n; };

// o caminho mais barato do lado alcançável (d1 ≥ 0) até um alvo (alvo ≠ -2: -1 = pedaço preso, k = o lugar de usar a
// peça k): 0-1 BFS em que o chão livre custa 0, a célula de mobília custa 1 e a parede (ou o limite) não passa.
// Devolve [dono do alvo, peças (índices de bo) que cobrem o caminho, fora o dono] ou null se não há caminho.
function corredor(g, cW, cO, d1, alvo, bo) {
  const N = g.N, custo = new Int32Array(N).fill(-1), pai = new Int32Array(N).fill(-1), dq = new Int32Array(2 * N + 2);
  let h = N + 1, t = N + 1, fim = -1;
  for (let k = 0; k < N; k++) if (d1[k] >= 0) custo[k] = 0;
  // começa só pela beirada do alcançável: o miolo já custa 0 e não leva a lugar nenhum novo (o mesmo resultado, mais rápido)
  for (let k = 0; k < N; k++) { if (d1[k] < 0) continue; const i = k % g.nx, j = (k / g.nx) | 0;
    if ((i + 1 < g.nx && d1[k + 1] < 0 && !cW[k + 1]) || (i > 0 && d1[k - 1] < 0 && !cW[k - 1]) || (j + 1 < g.nz && d1[k + g.nx] < 0 && !cW[k + g.nx]) || (j > 0 && d1[k - g.nx] < 0 && !cW[k - g.nx])) dq[t++] = k; }
  while (h < t) { const k = dq[h++]; if (alvo[k] !== -2) { fim = k; break; }
    const i = k % g.nx, j = (k / g.nx) | 0, c = custo[k];
    for (const q of [i + 1 < g.nx ? k + 1 : -1, i > 0 ? k - 1 : -1, j + 1 < g.nz ? k + g.nx : -1, j > 0 ? k - g.nx : -1]) {
      if (q < 0 || cW[q]) continue; const w = cO[q] ? 1 : 0;
      if (custo[q] >= 0 && custo[q] <= c + w) continue;
      custo[q] = c + w; pai[q] = k; if (w) dq[t++] = q; else dq[--h] = q; } }
  if (fim < 0) return null;
  const dono = alvo[fim], out = [];
  for (let k = fim; k >= 0 && d1[k] < 0; k = pai[k]) { if (!cO[k]) continue; const x = g.cx(k % g.nx), z = g.cz((k / g.nx) | 0);
    for (let n = 0; n < bo.length; n++) if (n !== dono && bo[n] && !out.includes(n) && dentroCaixa(bo[n], x, z, RAIO)) out.push(n); }
  return [dono, out.sort((a, b) => a - b)];
}

// ------------------------------------------------------------------------------------------------ inspeção
export function inspecionar(L, els, o = {}) {
  const W = L.largura, D = L.profundidade, E = {}, rel = Object.fromEntries(Object.keys(CRITERIOS).map(k => [k, 0]));
  for (const e of els || []) E[e.id] = e;
  let inst = L.instancias.map(s => ({ ...s })), paredes = (L.paredes || []).map(p => ({ ...p }));
  const sol = (s) => { const e = E[s.elemento]; return !!e && e.colide !== false; };
  const [ix, iz] = L.inicio || [0, 0];
  const caixas = () => paredes.filter(solida).map(caixaPar);
  let cP = caixas(), portas = acharPortas(paredes);
  const naPorta = (b) => portas.some(d => cruza(b, caixa(d.x, d.z, d.larg / 2, d.esp / 2 + .9, d.rot), .02));
  const noInicio = (b) => cruza(b, caixa(ix, iz, .9, .9, 0), .02);
  const tira = (k, porque) => { inst[k] = null; rel[porque]++; };

  // 1–5: limite, parede, sobreposto, porta, início
  for (let k = 0; k < inst.length; k++) { const s = inst[k], e = E[s.elemento]; if (!e) continue; const b = caixaObj(s, e), [ex, ez] = aabb(b);
    if (s.x - ex < -W / 2 - .05 || s.x + ex > W / 2 + .05 || s.z - ez < -D / 2 - .05 || s.z + ez > D / 2 + .05) { tira(k, 'limite'); continue; }
    if (cP.some(p => cruza(b, p, .03))) { tira(k, 'parede'); continue; }
    if (!sol(s)) continue;
    if (naPorta(b)) { tira(k, 'porta'); continue; }
    if (noInicio(b)) { tira(k, 'inicio'); continue; }
    for (let q = 0; q < k; q++) { const t = inst[q]; if (t && sol(t) && cruza(b, caixaObj(t, E[t.elemento]), .05)) { tira(k, 'sobreposto'); break; } } }

  // 6: encostar. Atrás da peça tem de haver parede (ou o limite do nível); senão ela vai para a vaga de parede mais perto
  const apoios = [...paredes.filter(p => (p.alt ?? 2.6) >= 1.4 && !(p.comp === p.esp && p.comp < 1)),
    { x: 0, z: -D / 2 - .1, rot: 0, comp: W, esp: .2 }, { x: 0, z: D / 2 + .1, rot: 0, comp: W, esp: .2 },
    { x: -W / 2 - .1, z: 0, rot: 90, comp: D, esp: .2 }, { x: W / 2 + .1, z: 0, rot: 90, comp: D, esp: .2 }];
  const atras = (s, e) => { const a = rad(s.rot || 0), m = e.d * (s.escala || 1) / 2 + .2, px = s.x - Math.sin(a) * m, pz = s.z - Math.cos(a) * m;
    if (px < -W / 2 || px > W / 2 || pz < -D / 2 || pz > D / 2) return true;
    return cP.some(p => dentroCaixa(p, px, pz, .12)); };
  const bloqP = new Int32Array(Grade(W, D).N);
  { const g = Grade(W, D); for (const p of cP) marcar(g, bloqP, p, 0, 1); }
  const gT = Grade(W, D);
  const vagaOk = (s, e, k) => { const b = caixaObj(s, e), [ex, ez] = aabb(b);
    if (s.x - ex < -W / 2 + .01 || s.x + ex > W / 2 - .01 || s.z - ez < -D / 2 + .01 || s.z + ez > D / 2 - .01) return false;
    if (cP.some(p => cruza(b, p, .03)) || naPorta(b) || noInicio(b)) return false;
    for (let q = 0; q < inst.length; q++) { const t = inst[q]; if (q === k || !t || !sol(t)) continue; if (cruza(b, caixaObj(t, E[t.elemento]), -.1)) return false; }
    const a = rad(s.rot), m = e.d * (s.escala || 1) / 2 + .45, fx = s.x + Math.sin(a) * m, fz = s.z + Math.cos(a) * m; // a frente tem chão
    return fx > -W / 2 && fx < W / 2 && fz > -D / 2 && fz < D / 2 && !bloqP[gT.de(fx, fz)]; };
  for (let k = 0; k < inst.length; k++) { const s = inst[k]; if (!s) continue; const e = E[s.elemento]; if (!e || regraDe(e) !== 'parede' || atras(s, e)) continue;
    const esc = s.escala || 1, hw = e.w * esc / 2, hd = e.d * esc / 2, cand = [];
    for (const p of apoios) { const a = rad(p.rot || 0), dx = Math.cos(a), dz = -Math.sin(a), L2 = p.comp / 2 - hw - .05; if (L2 < 0) continue;
      for (const lado of [1, -1]) { const nx = -dz * lado, nz = dx * lado, off = (p.esp ?? .2) / 2 + hd + .04;
        for (let u = -L2; u <= L2 + 1e-6; u += .5) { const x0 = p.x + dx * u + nx * off, z0 = p.z + dz * u + nz * off;
          if (Math.abs(x0 - s.x) > 12.1 || Math.abs(z0 - s.z) > 12.1) continue; // até 12 m
          const x = Math.round(x0 * 1e3) / 1e3, z = Math.round(z0 * 1e3) / 1e3; // medida já arredondada: empates iguais na Godot
          const dq = Math.round(((x - s.x) * (x - s.x) + (z - s.z) * (z - s.z)) * 1e4); if (dq <= 1440000) cand.push([dq, cand.length, x, z, Math.atan2(nx, nz) * 180 / Math.PI]); } } }
    let ok = false;
    for (let n = 0; n < cand.length; n++) { let m = n; for (let q = n + 1; q < cand.length; q++) if (cand[q][0] < cand[m][0] || (cand[q][0] === cand[m][0] && cand[q][1] < cand[m][1])) m = q; // a mais perto que falta
      const c = cand[m]; cand[m] = cand[n]; cand[n] = c; const t = { ...s, x: c[2], z: c[3], rot: Math.round((((c[4] % 360) + 360) % 360) * 10) / 10 };
      if (vagaOk(t, e, k)) { inst[k] = t; ok = true; break; } }
    rel.encostar++; if (!ok) inst[k] = null;
  }

  // 7–9: alcance. Grade com as paredes (+ raio do andarilho): primeiro os cômodos sem entrada, depois a mobília
  const g = Grade(W, D), borda = bordas(g, W, D);
  let cW = new Int32Array(g.N); for (const p of cP) marcar(g, cW, p, RAIO, 1); cW = somar(cW, borda);
  let d0 = inundar(g, cW, celInicio(g, cW, ix, iz));
  // cômodos sem entrada: cada pedaço do chão que só as paredes isolam ganha uma porta para o lado alcançável
  const mac = (L.macicos || []);
  for (let it = 0; it < 30; it++) {
    const lab = new Int32Array(g.N).fill(-1), fila = new Int32Array(g.N), tam = [];
    for (let s = 0; s < g.N; s++) { if (cW[s] || d0[s] >= 0 || lab[s] >= 0) continue; const id = tam.length; let a = 0, f = 0; fila[f++] = s; lab[s] = id;
      while (a < f) { const k = fila[a++], i = k % g.nx, j = (k / g.nx) | 0;
        for (const q of [i + 1 < g.nx ? k + 1 : -1, i > 0 ? k - 1 : -1, j + 1 < g.nz ? k + g.nx : -1, j > 0 ? k - g.nx : -1]) if (q >= 0 && !cW[q] && d0[q] < 0 && lab[q] < 0) { lab[q] = id; fila[f++] = q; } }
      let emMac = 0; for (let q = 0; q < f; q++) { const k = fila[q], x = g.cx(k % g.nx), z = g.cz((k / g.nx) | 0); if (mac.some(([mx, mz, h]) => Math.abs(x - mx) < h && Math.abs(z - mz) < h)) emMac++; }
      tam.push(f * CEL * CEL >= 2 && emMac * 2 < f); }
    if (!tam.some(Boolean)) break;
    const vale = (q) => lab[q] >= 0 && tam[lab[q]];
    let melhor = null; // [parede, u]: a primeira parede reta com um vão possível entre um pedaço isolado e o lado alcançável
    for (let n = 0; n < paredes.length && !melhor; n++) { const p = paredes[n], r = ((Math.round(p.rot || 0) % 180) + 180) % 180;
      if ((r !== 0 && r !== 90) || !solida(p) || p.comp < PORTA + .4 || (p.comp === p.esp && p.comp < 1)) continue;
      const a = rad(p.rot || 0), dx = Math.cos(a), dz = -Math.sin(a), nx = -dz, nz = dx, off = (p.esp ?? .2) / 2 + RAIO + .15, us = [];
      for (let u = -p.comp / 2 + PORTA / 2 + .1; u <= p.comp / 2 - PORTA / 2 - .1 + 1e-6; u += CEL) {
        const x = p.x + dx * u, z = p.z + dz * u, A = g.de(x + nx * off, z + nz * off), B = g.de(x - nx * off, z - nz * off);
        const ok = (vale(A) && d0[B] >= 0) || (vale(B) && d0[A] >= 0); us.push(ok ? u : null); }
      let ini2 = -1, best = [0, 0];
      for (let q = 0; q <= us.length; q++) { if (q < us.length && us[q] !== null) { if (ini2 < 0) ini2 = q; continue; }
        if (ini2 >= 0 && q - ini2 > best[0]) best = [q - ini2, ini2]; ini2 = -1; }
      if (best[0] >= 3) melhor = [n, us[best[1] + (best[0] >> 1)]]; }
    if (!melhor) break; // sem parede reta que dê para abrir: o que estiver lá dentro sai (inalcançável)
    const [n, u] = melhor, p = paredes[n], a = rad(p.rot || 0), dx = Math.cos(a), dz = -Math.sin(a), novas = [];
    for (const [s0, s1] of [[-p.comp / 2, u - PORTA / 2], [u + PORTA / 2, p.comp / 2]]) { if (s1 - s0 < .25) continue; const m = (s0 + s1) / 2;
      novas.push({ ...p, comp: +(s1 - s0).toFixed(3), x: +(p.x + dx * m).toFixed(3), z: +(p.z + dz * m).toFixed(3) }); }
    paredes.splice(n, 1, ...novas); rel.fechado++;
    cP = caixas(); portas = acharPortas(paredes); cW = new Int32Array(g.N); for (const b of cP) marcar(g, cW, b, RAIO, 1); cW = somar(cW, borda);
    d0 = inundar(g, cW, celInicio(g, cW, ix, iz));
  }
  // a mobília sólida; portas (as novas também) sem nada sólido na frente; o que só a mobília fecha, ela libera
  const cO = new Int32Array(g.N), bo = [];
  inst.forEach((s, k) => { const b0 = s && sol(s) ? caixaObj(s, E[s.elemento]) : null; bo[k] = b0 ? alinhada(b0) : null;
    if (b0 && rel.fechado && naPorta(b0)) { bo[k] = null; tira(k, 'porta'); } if (bo[k]) marcar(g, cO, bo[k], RAIO, 1); });
  const tudo = () => somar(cW, cO);
  let d1; { const t = tudo(); d1 = inundar(g, t, celInicio(g, t, ix, iz)); }
  const minCel = Math.round(.5 / (CEL * CEL)), M_USO = RAIO + .3, desiste = new Set();
  // as células de onde se usa a peça k: em volta dela, até 30 cm além do corpo do andarilho
  const usoDe = (k, fn) => { const s = inst[k], b = caixaObj(s, E[s.elemento]), [ex, ez] = aabb(b);
    const i0 = Math.max(0, Math.floor((b.x - ex - M_USO - g.X0) / CEL)), i1 = Math.min(g.nx - 1, Math.floor((b.x + ex + M_USO - g.X0) / CEL));
    const j0 = Math.max(0, Math.floor((b.z - ez - M_USO - g.Z0) / CEL)), j1 = Math.min(g.nz - 1, Math.floor((b.z + ez + M_USO - g.Z0) / CEL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = g.cx(i), z = g.cz(j); if (dentroCaixa(b, x, z, M_USO)) fn(j * g.nx + i, x, z); } };
  // o conserto só tira mobília: quem já se alcança continua alcançável (guarda, para não recontar a cada corredor)
  const jaAlc = new Uint8Array(inst.length);
  const alcancavel = (k) => { if (jaAlc[k]) return true; let ok = false; usoDe(k, (q) => { if (d1[q] >= 0) ok = true; }); if (ok) jaAlc[k] = 1; return ok; };
  const liberar = () => { for (let it = 0; it < 60; it++) {
    const preso = new Uint8Array(g.N); let np = 0; for (let k = 0; k < g.N; k++) if (d0[k] >= 0 && d1[k] < 0 && !cO[k]) { preso[k] = 1; np++; }
    // os alvos: o pedaço preso (-1) e o lugar de usar cada peça sólida que ficou sem acesso (o índice dela)
    const alvo = new Int32Array(g.N).fill(-2); let tem = false;
    if (np >= minCel) for (let k = 0; k < g.N; k++) if (preso[k]) { alvo[k] = -1; tem = true; }
    for (let k = 0; k < inst.length; k++) { if (!inst[k] || !bo[k] || desiste.has(k) || alcancavel(k)) continue;
      usoDe(k, (q, x, z) => { if (!cW[q] && d0[q] >= 0 && alvo[q] === -2 && !dentroCaixa(bo[k], x, z, RAIO)) { alvo[q] = k; tem = true; } }); }
    if (!tem) return;
    if (np >= minCel) { // a peça menor que, sozinha, libera o pedaço preso
      const n1 = contar(d1), cands = [];
      bo.forEach((b, k) => { if (!b) return; const [ex, ez] = aabb(b); let toca = false;
        const i0 = Math.max(0, Math.floor((b.x - ex - RAIO - CEL - g.X0) / CEL)), i1 = Math.min(g.nx - 1, Math.floor((b.x + ex + RAIO + CEL - g.X0) / CEL));
        const j0 = Math.max(0, Math.floor((b.z - ez - RAIO - CEL - g.Z0) / CEL)), j1 = Math.min(g.nz - 1, Math.floor((b.z + ez + RAIO + CEL - g.Z0) / CEL));
        let ta = false; // só quem encosta no pedaço preso e no lado alcançável pode abrir caminho
        for (let j = j0; j <= j1 && !(toca && ta); j++) for (let i = i0; i <= i1; i++) { const q = j * g.nx + i; if (preso[q]) toca = true; else if (d1[q] >= 0) ta = true; }
        if (toca && ta) cands.push([b.hu * b.hw, k]); });
      cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let tirou = false;
      for (const [, k] of cands) { marcar(g, cO, bo[k], RAIO, -1); const t = tudo(), d = inundar(g, t, celInicio(g, t, ix, iz));
        if (contar(d) - n1 >= minCel) { d1 = d; bo[k] = null; tira(k, 'bloqueio'); tirou = true; break; } marcar(g, cO, bo[k], RAIO, 1); }
      if (tirou) continue; }
    // nenhuma sozinha: um corredor até o alvo mais perto (mesa cercada pelas cadeiras: sai a cadeira, não a mesa)
    const c = corredor(g, cW, cO, d1, alvo, bo); if (!c) return;
    const [dono, tiradas] = c;
    if (dono >= 0 && (tiradas.length > 2 || !tiradas.length)) { desiste.add(dono); continue; } // não se derruba meia sala por uma peça
    if (!tiradas.length) return;
    for (const k of tiradas) { marcar(g, cO, bo[k], RAIO, -1); bo[k] = null; tira(k, 'bloqueio'); }
    const t = tudo(); d1 = inundar(g, t, celInicio(g, t, ix, iz)); } };

  // o que mesmo assim ficou sem acesso sai; se isso abriu um pedaço preso (a mesa no meio das cadeiras), libera de novo
  for (let volta = 0; volta < 2; volta++) {
    liberar(); let n = 0;
    for (let k = 0; k < inst.length; k++) { if (!inst[k] || !E[inst[k].elemento] || alcancavel(k)) continue;
      if (bo[k]) { marcar(g, cO, bo[k], RAIO, -1); bo[k] = null; } tira(k, 'inalcancavel'); n++; }
    if (!n) break;
    const t = tudo(); d1 = inundar(g, t, celInicio(g, t, ix, iz)); }

  const out = { ...L, instancias: inst.filter(Boolean), paredes };
  if (o.relatorio !== false) out.inspecao = relatorio(out, E, els, g, cW, cO, rel);
  return out;
}

// ------------------------------------------------------------------------------------------------ relatório (só a Forja)
function relatorio(L, E, els, g, cW, cO, rel) {
  const t = somar(cW, cO), d = inundar(g, t, celInicio(g, t, L.inicio[0], L.inicio[1]));
  const mac = L.macicos || [], emMac = (k) => { const x = g.cx(k % g.nx), z = g.cz((k / g.nx) | 0); return mac.some(([mx, mz, h]) => Math.abs(x - mx) < h && Math.abs(z - mz) < h); };
  let livre = 0, alc = 0, maxd = 0; for (let k = 0; k < g.N; k++) { if (!t[k] && !emMac(k)) livre++; if (d[k] >= 0) { alc++; if (d[k] > maxd) maxd = d[k]; } }
  const area = alc * CEL * CEL, alcance = livre ? alc / livre : 1, percurso = maxd * CEL, diag = L.largura + L.profundidade;
  let ocup = 0; for (const s of L.instancias) { const e = E[s.elemento]; if (e && e.colide !== false) ocup += e.w * e.d * (s.escala || 1) ** 2; }
  const ocupacao = area + ocup ? ocup / (area + ocup) : 0;
  let vazias = 0; try { const Es = espacos(L), n = new Array(Es.area.length).fill(0); for (const s of L.instancias) { const q = Es.de(s.x, s.z); if (q >= 0) n[q]++; }
    Es.area.forEach((a, q) => { if (!Es.borda[q] && a >= 9 && !n[q]) vazias++; }); } catch { /* sem paredes */ }
  const tem = new Set(L.instancias.map(s => s.elemento)), faltam = (els || []).filter(e => e.qtd > 0 && e.w > 0 && e.d > 0 && !tem.has(e.id)).map(e => e.nome || e.id);
  const consertos = { limite: 'fora do chão', parede: 'atravessando parede', sobreposto: 'um dentro do outro', porta: 'na frente de porta',
    inicio: 'em cima do início', encostar: 'levados para a parede (ou tirados)', bloqueio: 'fechando passagem', fechado: 'porta(s) aberta(s)', inalcancavel: 'onde não se chega' };
  const itens = Object.entries(consertos).map(([id, txt]) => ({ id, nome: CRITERIOS[id], ok: true, n: rel[id], txt: rel[id] ? `${rel[id]} ${txt} — consertado` : 'ok' }));
  itens.push({ id: 'alcance', nome: CRITERIOS.alcance, ok: alcance >= .97, n: alcance, txt: `${Math.round(alcance * 100)}% do chão livre (${Math.round(area)} m²)` });
  itens.push({ id: 'percurso', nome: CRITERIOS.percurso, ok: percurso >= diag * .45, n: percurso, txt: `${Math.round(percurso)} m andando até o ponto mais longe` });
  itens.push({ id: 'ocupacao', nome: CRITERIOS.ocupacao, ok: ocupacao >= .03 && ocupacao <= .4, n: ocupacao, txt: `${Math.round(ocupacao * 100)}% do chão com mobília` + (ocupacao < .03 ? ' (vazio)' : ocupacao > .4 ? ' (entulhado)' : '') });
  itens.push({ id: 'vazias', nome: CRITERIOS.vazias, ok: vazias === 0, n: vazias, txt: vazias ? `${vazias} cômodo(s) grande(s) vazio(s)` : 'ok' });
  itens.push({ id: 'faltando', nome: CRITERIOS.faltando, ok: faltam.length * 2 <= tem.size, n: faltam.length, txt: faltam.length ? 'não couberam: ' + faltam.join(', ') : 'ok' });
  const ruins = itens.filter(i => !i.ok).length, mexidos = Object.values(rel).reduce((a, b) => a + b, 0);
  const nota = Math.max(0, Math.round(100 - ruins * 12 - (1 - alcance) * 60 - Math.min(10, mexidos * .5)));
  return { nota, itens, mexidos };
}
