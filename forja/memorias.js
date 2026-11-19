// As memórias de um nível: onde ficam, com critério. Fonte única: a Forja (Campanha → nível → Memórias) desenha a prévia
// com esta função e o jogo (bolha/index.html memPlanejar) usa a mesma — forja/bolha.py copia este arquivo para bolha/forja/.
//
// Critério (nada solto ao acaso):
//   - o caminho do início até a saída é dividido em N faixas iguais; cada memória fica numa faixa (sorteada dentro dela),
//     então elas puxam o andarilho do começo ao fim, sem duas no mesmo trecho;
//   - os lados alternam (esquerda/direita do caminho) e o desvio é maior no meio do percurso (onde explorar compensa)
//     e menor perto do início e da saída;
//   - nenhuma fica a menos de `margem` m do início ou da saída, nem a menos de `espaco` m de outra.
// O jogo depois só encaixa cada ponto no chão livre mais perto (fora de móvel e parede; dentro, se o nível é fechado).
export const MEM_PADRAO = { qtd: 10, desvio: .45, espaco: 9, margem: 6, vida: 100 };

export function cfgMemorias(par = (g, k, p) => p, cfg = {}) {
  const v = (k) => { const x = cfg?.[k]; return x !== undefined && x !== null && x !== '' ? +x : +par('memorias', k, MEM_PADRAO[k]); };
  return { qtd: Math.max(0, Math.min(30, Math.round(v('qtd')))), desvio: Math.max(0, v('desvio')), espaco: Math.max(0, v('espaco')), margem: Math.max(0, v('margem')), vida: Math.max(0, Math.min(100, v('vida'))) };
}

// ini, saida: [x, z] em metros; rnd(): 0..1 com semente. Devolve [{ k, x, z, t, lado }]
export function planoMemorias(cfg, ini, saida, rnd) {
  const n = cfg.qtd | 0; if (n <= 0) return [];
  const [sx, sz] = ini, dx = saida[0] - sx, dz = saida[1] - sz, D = Math.max(1, Math.hypot(dx, dz));
  const ux = dx / D, uz = dz / D, vx = -uz, vz = ux, a0 = .06, a1 = .94, out = [];
  for (let k = 0; k < n; k++) {
    const f0 = a0 + (a1 - a0) * k / n, f1 = a0 + (a1 - a0) * (k + 1) / n;
    const lado0 = (k % 2 ? 1 : -1) * (rnd() < .2 ? -1 : 1); // alterna, com uma troca de vez em quando para não virar zigue-zague
    let melhor = null, nota = -Infinity;
    for (let tent = 0; tent < 12; tent++) {
      const t = f0 + (f1 - f0) * (.15 + .7 * rnd()), lado = tent < 6 ? lado0 : -lado0;
      const amp = cfg.desvio * D * Math.sin(Math.PI * t) * (.3 + .7 * rnd()) + Math.min(3, cfg.espaco * .3) * (tent > 8 ? 1 : 0);
      const x = sx + ux * D * t + vx * amp * lado, z = sz + uz * D * t + vz * amp * lado;
      const ds = Math.min(Math.hypot(x - sx, z - sz), Math.hypot(x - saida[0], z - saida[1])), dm = out.length ? Math.min(...out.map(p => Math.hypot(x - p.x, z - p.z))) : 1e9;
      const ok = ds >= cfg.margem && dm >= cfg.espaco, s = (ok ? 1e6 : 0) + Math.min(ds - cfg.margem, dm - cfg.espaco);
      if (s > nota) { nota = s; melhor = { k, x, z, t, lado }; }
      if (ok) break;
    }
    out.push(melhor);
  }
  return out;
}

// as frases das N memórias do nível: as do nível (Campanha → Memórias) ou, sem elas, um trecho dos memos do jogo que
// muda com a posição do nível na campanha (níveis diferentes, memórias diferentes)
export function frasesMemorias(n, proprias, memos, posicao = 0) {
  const lista = (proprias || []).map(f => Array.isArray(f) ? [String(f[0] || ''), String(f[1] || '')] : [String(f || ''), '']).filter(f => f[0].trim());
  if (lista.length) return Array.from({ length: n }, (_, k) => lista[k % lista.length]);
  const m = memos || []; if (!m.length) return Array.from({ length: n }, () => ['', '']);
  const o = (Math.max(0, posicao) * n) % m.length;
  return Array.from({ length: n }, (_, k) => m[(o + k) % m.length]);
}
