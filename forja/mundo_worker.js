// Monta os blocos de um nível da Forja fora da thread do jogo (o jogo só encaixa as malhas prontas: andar não trava).
// Mensagens: {tipo: 'nivel', id, N, cores, par, L, seed}  → prepara o mundo (o mesmo criarMundo que o jogo usa)
//            {tipo: 'montar', id, ci, cj}                 → devolve {tipo: 'bloco', id, ci, cj, R} com os arrays
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { criarMundo, serializar } from './mundo.js';
import { ruido } from './ruido.js';

let W = null, nivel = null;
const transf = (o, out = new Set()) => { if (!o) return out; if (ArrayBuffer.isView(o)) { out.add(o.buffer); return out; } if (typeof o === 'object') for (const v of Object.values(o)) transf(v, out); return out; };

onmessage = (e) => {
  const m = e.data;
  if (m.tipo === 'nivel') {
    const cores = m.cores, R = ruido(m.seed), par = (g, k, p) => { const v = m.par?.[g]?.[k]; return v === undefined ? p : v; };
    const modelos = Object.fromEntries((m.modelos || []).map(id => [id, true]));
    nivel = m.id; W = null;
    try { W = criarMundo(m.N, { THREE, hue: (c) => cores[c] || cores.CL, fbm: R.fbm, h3: R.h3, semente: m.semente, par, L: m.L, modelos, teto: m.teto || null }); } // teto: Jogo → Teto da Forja
    catch (err) { postMessage({ tipo: 'erro', id: m.id, msg: 'o mundo não foi preparado no worker: ' + (err?.message || err) }); }
    return;
  }
  if (m.tipo === 'montar') {
    // sempre responde: sem resposta o jogo ficava esperando o bloco para sempre (e o cenário parava de ser criado)
    if (!W || m.id !== nivel) { postMessage({ tipo: 'erro', id: m.id, ci: m.ci, cj: m.cj, msg: 'worker sem o nível ' + m.id }); return; }
    try {
      const out = serializar(W.montar(m.ci, m.cj)); out.L = W.modulo(m.ci, m.cj).L; // o layout vai junto: o jogo não precisa gerar de novo
      postMessage({ tipo: 'bloco', id: m.id, ci: m.ci, cj: m.cj, R: out }, [...transf(out)]);
    } catch (err) { postMessage({ tipo: 'erro', id: m.id, ci: m.ci, cj: m.cj, msg: (err?.message || String(err)) }); }
  }
};
