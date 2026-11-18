// O ruído do jogo (= h3, vnoise e fbm do index), para o mundo da Forja e o worker que monta os blocos.
// SEED é a semente do nível: o mesmo h3 que o jogo usa, então o worker e o jogo sorteiam igual.
export function ruido(SEED) {
  const h3 = (i, j, k) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041) + Math.imul(SEED, 97) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
  const vnoise = (x, z, k) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = h3(i, j, k), b = h3(i + 1, j, k), c = h3(i, j + 1, k), d = h3(i + 1, j + 1, k); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, z, o, k) => { let s = 0, a = .5, f = 1, n = 0; for (let q = 0; q < o; q++) { s += a * vnoise(x * f, z * f, k); n += a; f *= 2.03; a *= .5; } return s / n; };
  return { h3, vnoise, fbm };
}
