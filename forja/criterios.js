// Regras espaciais extraídas de teste_8/index.html. Dados compartilhados com Python e Godot.
import REGRAS from './criterios.json' with { type: 'json' };
export { REGRAS };
export function elementoNoEstilo(e, estilo) {
  if (e.estilos?.length) return e.estilos.includes(estilo);
  const ps = REGRAS.elementos_por_estilo[estilo];
  const nome = `${e.id} ${e.nome || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return !ps || ps.some(p => nome.includes(p));
}
export function biblioteca(vis = {}) {
  const out = { ...vis };
  for (const k of ['pisos', 'paredes']) {
    const xs = (vis[k] || []).filter(x => x.ativo !== false && !x.id?.startsWith('__forja_'));
    out[k] = [...xs, ...REGRAS[k].map(x => ({ ...x, peso: 0, ativo: true, origem: 'criterio' }))];
  }
  return out;
}
export function opcoes(o, estilo) {
  if (!o.tema && o.funcoes?.length) return { ...o, tema: '' };
  const tema = o.tema || ({ escritorio_infinito: 'jogo_nivel_0', arquivo_morto: 'jogo_nivel_1', corredores_concreto: 'jogo_nivel_2' })[estilo] || '';
  const t = REGRAS.temas[tema];
  return { ...o, tema, funcoes: o.funcoes?.some(f => f.els) ? o.funcoes : t?.salas ? Object.entries(t.salas).map(([id, peso]) => ({ id, peso, min: REGRAS.salas[id]?.min || 0 })) : o.funcoes || [] };
}
export function contexto(L, x, z) {
  return (L.zonas || []).find(q => x >= q.x - q.w / 2 - .001 && x < q.x + q.w / 2 - .001 && z >= q.z - q.d / 2 - .001 && z < q.z + q.d / 2 - .001)
    || { estilo: L.estilo, amb: L.amb || 'misto' };
}
export function tipoBarreira(estilo, amb, tema = '') {
  if (estilo === 'canal') return 'muro';
  if (estilo === 'jardim_labirinto') return 'sebe';
  if (estilo === 'corredores_concreto') return 'concreto';
  return amb === 'externo' ? 'muro' : (REGRAS.temas[tema]?.parede === 'concreto' ? 'concreto' : 'edificio');
}
// A parede guarda sua origem; na costura, amostramos OS DOIS lados. Um prédio mantém a fachada.
export function barreiras(L) {
  const out = [];
  for (const p of L.paredes || []) {
    const a = (p.rot || 0) * Math.PI / 180, dx = Math.cos(a), dz = -Math.sin(a), nx = -dz, nz = dx;
    const cortes = [-p.comp / 2, p.comp / 2];
    for (const q of L.zonas || []) for (const [c, v, dir] of [[q.x - q.w / 2, p.x, dx], [q.x + q.w / 2, p.x, dx], [q.z - q.d / 2, p.z, dz], [q.z + q.d / 2, p.z, dz]]) {
      if (Math.abs(dir) < .001) continue;
      const t = (c - v) / dir; if (t > -p.comp / 2 + .01 && t < p.comp / 2 - .01) cortes.push(t);
    }
    cortes.sort((a, b) => a - b);
    for (let i = 1; i < cortes.length; i++) {
      const u = cortes[i - 1], v = cortes[i]; if (v - u < .01) continue;
      const x = p.x + dx * (u + v) / 2, z = p.z + dz * (u + v) / 2, e = (p.esp || .2) / 2 + .02;
      const lados = [contexto(L, x + nx * e, z + nz * e), contexto(L, x - nx * e, z - nz * e)];
      const dentro = lados.find(q => q.amb === 'interno');
      const tipo = dentro ? tipoBarreira(dentro.estilo, 'interno', L.tema) : p.barreira || tipoBarreira(p.origem_estilo || L.estilo, p.amb || L.amb, L.tema);
      const fachada = p.barreira === 'sebe' && dentro;
      out.push({ ...p, x: +x.toFixed(3), z: +z.toFixed(3), comp: +(v - u).toFixed(3), barreira: tipo,
        esp: fachada ? .2 : p.esp, alt: fachada ? REGRAS.temas[L.tema]?.altura || 2.6 : p.alt });
    }
  }
  return { ...L, paredes: out };
}
const fora = x => x.papel === 'externo' || x.amb === 'externo' || ['VG', 'VD'].includes(x.cls) || ['VG', 'VD'].includes(x.cls2);
export function escolherParede(pars, tipo) {
  let xs = pars.filter(x => (x.peso ?? 1) > 0 && (tipo === 'sebe' ? x.padrao === 'sebe' : tipo === 'muro' ? fora(x) && ['blocos', 'tijolo', 'concreto'].includes(x.padrao) : tipo === 'concreto' ? !fora(x) && x.padrao === 'concreto' : !fora(x) && x.padrao !== 'sebe' && x.papel === 'principal'));
  // Identidade arquitetônica estável: preferir a base, variações continuam dentro do próprio material.
  return xs[0] || pars.find(x => x.id === '__forja_' + tipo);
}
export function escolherPiso(pisos, tipo, amb = 'interno') {
  const xs = pisos.filter(x => (x.peso ?? 1) > 0 && (tipo === 'cascalho' || tipo === 'relva' ? fora(x) : !fora(x)));
  const nome = x => String(x.nome || '').toLowerCase();
  return xs.find(x => x.tipo === tipo || nome(x).includes(tipo) || (tipo === 'relva' && /grama|relva/.test(nome(x))) || (tipo === 'concreto' && /concreto|cimento/.test(nome(x))))
    || xs.find(x => ['ladrilho', 'carpete'].includes(tipo) && x.padrao === tipo)
    || pisos.find(x => x.id === '__forja_' + tipo);
}
export function pisoContexto(L, q, funcao = '') {
  const t = REGRAS.temas[L.tema] || {};
  let base = q.amb === 'externo' ? (['campo', 'espelhos', 'canal', 'estrada'].includes(q.estilo) ? 'relva' : ['jardim_labirinto', 'praca'].includes(q.estilo) ? 'cascalho' : '')
    : ['arquivo_morto', 'corredores_concreto'].includes(q.estilo) ? 'concreto' : t.piso || (q.estilo === 'escritorio_infinito' ? 'ladrilho' : '');
  if (!funcao) return base;
  if (t.prologo) return ['reuniao', 'vazio', 'rh'].includes(funcao) ? 'carpete' : base;
  const p = REGRAS.salas[funcao]?.piso; return p && p !== 'base' ? p : base;
}
export function chaoCoerente(L, chao, pisos) {
  const porId = Object.fromEntries(pisos.map(p => [p.id, p])), nx = Math.ceil(L.largura * 2), nz = Math.ceil(L.profundidade * 2), vals = [], out = [];
  const contem = (q, x, z) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = -L.largura / 2 + (i + .5) / 2, z = -L.profundidade / 2 + (j + .5) / 2, q = contexto(L, x, z);
    const sala = (L.salas || []).find(s => contem(s, x, z));
    const tipo = pisoContexto(L, q, sala?.funcao || '');
    let p = tipo ? escolherPiso(pisos, tipo, q.amb) : porId[chao.find(g => contem(g, x, z) && porId[g.p]?.papel !== 'detalhe')?.p];
    if (!p || (!tipo && q.amb === 'interno' && fora(p))) p = escolherPiso(pisos, 'concreto');
    if (!tipo && q.amb === 'externo' && !fora(p)) p = escolherPiso(pisos, 'cascalho');
    vals.push(p.id);
  }
  const usado = new Uint8Array(vals.length);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (usado[k]) continue;
    const p = vals[k]; let w = 1, h = 1;
    while (i + w < nx && !usado[k + w] && vals[k + w] === p) w++;
    for (let ok = true; ok && j + h < nz;) { for (let a = 0; a < w; a++) if (usado[k + h * nx + a] || vals[k + h * nx + a] !== p) { ok = false; break; } if (ok) h++; }
    for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) usado[k + b * nx + a] = 1;
    out.push({ x0: -L.largura / 2 + i / 2, z0: -L.profundidade / 2 + j / 2, x1: Math.min(L.largura / 2, -L.largura / 2 + (i + w) / 2), z1: Math.min(L.profundidade / 2, -L.profundidade / 2 + (j + h) / 2), p, s: pisos.findIndex(x => x.id === p) + 2000 });
  }
  // Asfalto é uma faixa funcional, nunca um piso sorteado em outro ambiente.
  for (const [x0, z0, x1, z1, papel] of L.faixas || []) if (papel === 'via') out.push({ x0, z0, x1, z1, p: escolherPiso(pisos, 'asfalto').id });
  // Preserva detalhes personalizados somente quando cabem inteiros no mesmo ambiente.
  for (const g of chao) if (porId[g.p]?.papel === 'detalhe') {
    const pontos = [[g.x0 + .01, g.z0 + .01], [g.x1 - .01, g.z0 + .01], [g.x0 + .01, g.z1 - .01], [g.x1 - .01, g.z1 - .01]];
    if (L.tema || !pontos.every(([x, z]) => (contexto(L, x, z).amb === 'externo') === fora(porId[g.p]))) continue;
    out.push(g);
  }
  return out;
}
